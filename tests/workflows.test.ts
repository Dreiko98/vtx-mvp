import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/app.ts';
import { openDatabase, one } from '../server/db.ts';
import { seed, DEMO_PASSWORD } from '../server/seed.ts';

test('shared workflows, server authorization and persistence', async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vtx-test-')),path=join(dir,'test.sqlite');let db=openDatabase(path);seed(db);
 const origin='http://127.0.0.1:3000';let server:Server,base='';
 async function start(){server=createApp(db,{origin}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;}
 async function stop(){await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
 await start();
 const clients=new Map<string,{cookie:string;csrf:string}>();
 async function req(who:string,path:string,method='GET',data?:any,expected=200){
  const c=clients.get(who);const form=data instanceof FormData;
  const r=await fetch(base+path,{method,headers:{origin,...(form?{}:{'content-type':'application/json'}),...(c?{cookie:c.cookie,'x-csrf-token':c.csrf}:{})},body:data===undefined?undefined:form?data:JSON.stringify(data)});
  const content=r.headers.get('content-type')||'';const body=content.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());assert.equal(r.status,expected,`${who} ${method} ${path}: ${JSON.stringify(body)}`);return {r,body};
 }
 async function login(who:string){const {r,body}=await req('', '/api/auth/login','POST',{email:`${who}@vtx.test`,password:DEMO_PASSWORD});clients.set(who,{cookie:r.headers.get('set-cookie')!.split(';')[0],csrf:body.csrf});return body;}
 let oid='',aid='',sid='',pid='',did='',cid='';
 try{
 await t.test('15 complete seeded identities; no prototype private settings',()=>{
  assert.equal(one(db,"SELECT COUNT(*) n FROM users WHERE role='athlete'")!.n,10);assert.equal(one(db,"SELECT COUNT(*) n FROM users WHERE role='brand'")!.n,5);
  assert.equal(seed(db),false);assert.ok(one(db,'SELECT password_hash FROM users LIMIT 1')!.password_hash!==DEMO_PASSWORD);
 });
 await t.test('unauthenticated requests, invalid credentials, CSRF and origin are rejected',async()=>{
  await req('', '/api/offers','GET',undefined,401);await req('','/api/auth/login','POST',{email:'lucia@vtx.test',password:'wrong'},401);
  await login('lucia');await login('vertice');await login('marta');await login('aqualis');
  const c=clients.get('lucia')!;
  const missing=await fetch(base+'/api/auth/logout',{method:'POST',headers:{origin,cookie:c.cookie}});assert.equal(missing.status,403);
  const foreign=await fetch(base+'/api/auth/logout',{method:'POST',headers:{origin:'https://untrusted.test',cookie:c.cookie,'x-csrf-token':c.csrf}});assert.equal(foreign.status,403);
 });
 await t.test('brand publishes; athlete applies; brand reviews; athlete sees status',async()=>{
  const d={title:'Integration test trail team',description:'A real persisted test offer.',sport:'Trail running',region:'Spain',values:['Community'],type:'Ambassador',budget:2200,deadline:'2027-08-01',startDate:'2027-08-02',endDate:'2027-12-31',deliverables:'Two posts and a season report',status:'draft'};
  oid=(await req('vertice','/api/offers','POST',d,201)).body.id;
  assert.equal((await req('lucia','/api/offers')).body.some((o:any)=>o.id===oid),false);
  await req('aqualis',`/api/offers/${oid}`,'PUT',{...d,status:'published'},404);
  await req('vertice',`/api/offers/${oid}`,'PUT',{...d,status:'published'});
  const published=(await req('lucia','/api/offers')).body.find((o:any)=>o.id===oid);assert.equal(published.match.score,100);
  aid=(await req('lucia',`/api/offers/${oid}/apply`,'POST',{motivation:'My community and race calendar fit this programme.'},201)).body.id;
  await req('lucia',`/api/offers/${oid}/apply`,'POST',{motivation:'Duplicate'},409);
  await req('vertice',`/api/applications/${aid}/status`,'PATCH',{status:'reviewing',note:'We are reviewing your race calendar.'});
  assert.equal((await req('lucia',`/api/applications/${aid}`)).body.status,'reviewing');
  assert.ok((await req('vertice','/api/applications')).body.some((a:any)=>a.id===aid));
 });
 await t.test('other accounts cannot read or mutate private applications and messages',async()=>{
  for(const who of ['marta','aqualis']){
   await req(who,`/api/applications/${aid}`,'GET',undefined,404);await req(who,`/api/applications/${aid}/messages`,'GET',undefined,404);
   await req(who,`/api/applications/${aid}/status`,'PATCH',{status:'rejected'},404);
   assert.equal((await req(who,'/api/applications')).body.some((a:any)=>a.id===aid),false);
  }
  await req('lucia',`/api/applications/${aid}/status`,'PATCH',{status:'shortlisted'},403);
  await req('lucia','/api/offers','POST',{},403);
 });
 await t.test('messages are shared, read receipts persist, scripts remain plain text',async()=>{
  await req('lucia',`/api/applications/${aid}/messages`,'POST',{text:'Hello <script>alert(1)</script>'},201);
  assert.equal((await req('vertice',`/api/applications/${aid}/messages`)).body[0].text,'Hello <script>alert(1)</script>');
  assert.equal((await req('vertice','/api/applications')).body.find((a:any)=>a.id===aid).unread,1);
  await req('vertice',`/api/applications/${aid}/read`,'POST',{});
  assert.equal((await req('vertice','/api/applications')).body.find((a:any)=>a.id===aid).unread,0);
 });
 await t.test('profile editing and saved profiles persist; scores use new declared profile',async()=>{
  const {body:{user}}=await req('lucia','/api/auth/me');user.profile.bio='Updated persistent synthetic athlete biography.';
  await req('lucia','/api/profile','PUT',{name:user.name,profile:user.profile});
  await req('vertice','/api/people/athlete-lucia/save','POST',{saved:true});
  assert.equal((await req('vertice','/api/people')).body.find((p:any)=>p.id==='athlete-lucia').saved,true);
  assert.equal((await req('vertice','/api/people/athlete-lucia')).body.profile.bio,user.profile.bio);
  await req('vertice','/api/people/athlete-lucia/view','POST',{});await req('vertice','/api/people/athlete-lucia/view','POST',{});
  assert.equal((await req('lucia','/api/dashboard')).body.views,1);
 });
 await t.test('proposal acceptance is athlete-only, immutable and creates a shared sponsorship once',async()=>{
  const d={value:2000,startDate:'2027-08-02',endDate:'2027-12-31',terms:'Equipment support and two agreed deliverables.',deliverables:[{title:'Training review',due:'2027-09-01'},{title:'Season report',due:'2027-12-15'}]};
  pid=(await req('vertice',`/api/applications/${aid}/proposals`,'POST',d,201)).body.id;
  await req('vertice',`/api/proposals/${pid}/respond`,'POST',{accept:true},403);
  await req('marta',`/api/proposals/${pid}/respond`,'POST',{accept:true},404);
  sid=(await req('lucia',`/api/proposals/${pid}/respond`,'POST',{accept:true})).body.sponsorshipId;
  await req('lucia',`/api/proposals/${pid}/respond`,'POST',{accept:true},409);
  assert.equal((await req('vertice','/api/sponsorships')).body.find((s:any)=>s.id===sid).value,2000);
  await req('vertice',`/api/applications/${aid}/status`,'PATCH',{status:'rejected'},409);
  did=(await req('lucia','/api/sponsorships')).body.find((s:any)=>s.id===sid).deliverables[0].id;
 });
 await t.test('evidence review, changes requested, payment caps and completion rules',async()=>{
  await req('marta',`/api/deliverables/${did}`,'PATCH',{evidenceUrl:'https://example.com/post',note:''},404);
  await req('vertice',`/api/deliverables/${did}`,'PATCH',{status:'approved',reviewNote:''},409);
  await req('lucia',`/api/deliverables/${did}`,'PATCH',{evidenceUrl:'javascript:alert(1)',note:''},422);
  await req('lucia',`/api/deliverables/${did}`,'PATCH',{evidenceUrl:'https://example.com/post',note:'Public evidence'});
  await req('vertice',`/api/deliverables/${did}`,'PATCH',{status:'changes_requested',reviewNote:'Please add the disclosure.'});
  await req('lucia',`/api/deliverables/${did}`,'PATCH',{evidenceUrl:'https://example.com/revised',note:'Disclosure added.'});
  await req('vertice',`/api/deliverables/${did}`,'PATCH',{status:'approved',reviewNote:'Looks good.'});
  await req('vertice',`/api/sponsorships/${sid}`,'PATCH',{status:'completed',paid:100,paymentNote:'Manual record'},409);
  await req('vertice',`/api/sponsorships/${sid}`,'PATCH',{status:'active',paid:3000,paymentNote:''},422);
  await req('vertice',`/api/sponsorships/${sid}`,'PATCH',{status:'active',paid:500,paymentNote:'Declared manually; no payment processed.'});
 });
 await t.test('private PDF and sourced manual reports are visible to both participants only',async()=>{
  const bad=new FormData();bad.set('file',new Blob(['not a PDF'],{type:'application/pdf'}),'bad.pdf');bad.set('note','Invalid document');await req('lucia',`/api/sponsorships/${sid}/contracts`,'POST',bad,422);
  const form=new FormData();form.set('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'agreement.pdf');form.set('note','Synthetic test attachment, externally signed status is not verified.');
  cid=(await req('lucia',`/api/sponsorships/${sid}/contracts`,'POST',form,201)).body.id;
  const downloaded=await req('vertice',`/api/contracts/${cid}/download`);assert.ok(downloaded.body.toString().startsWith('%PDF-'));await req('aqualis',`/api/contracts/${cid}/download`,'GET',undefined,404);
  await req('lucia',`/api/sponsorships/${sid}/results`,'POST',{date:'2026-11-22',reach:5000,engagements:250,sales:400,cost:200,source:'Synthetic test analytics export',note:'Declared data, no automatic attribution.'},201);
  const s=(await req('vertice','/api/sponsorships')).body.find((s:any)=>s.id===sid);assert.equal(s.results[0].sales,400);assert.equal(s.contracts.length,1);assert.equal(s.paid,500);
  await req('marta',`/api/sponsorships/${sid}/results`,'POST',{},404);
 });
 await t.test('data survives logout, new sessions and a full server/database restart',async()=>{
  const old=clients.get('lucia')!;await req('lucia','/api/auth/logout','POST',{});await req('lucia','/api/auth/me','GET',undefined,401);
  await stop();db.close();db=openDatabase(path);await start();await login('lucia');await login('vertice');
  assert.notEqual(clients.get('lucia')!.cookie,old.cookie);assert.equal((await req('lucia',`/api/applications/${aid}`)).body.status,'accepted');
  assert.equal((await req('lucia','/api/auth/me')).body.user.profile.bio,'Updated persistent synthetic athlete biography.');
  assert.equal((await req('vertice',`/api/applications/${aid}/messages`)).body.length,1);
  assert.ok((await req('lucia','/api/sponsorships')).body.some((s:any)=>s.id===sid));
  await req('aqualis',`/api/contracts/${cid}/download`,'GET',undefined,404);
 });
 }finally{await stop();db.close();rmSync(dir,{recursive:true,force:true});}
});
