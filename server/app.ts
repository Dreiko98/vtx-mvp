import express, {type Request, type Response, type NextFunction} from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { all, hashToken, id, one, run, transaction, verifyPassword, type DB } from './db.ts';
import { compatibility, date, offerSchema, profileSchema, url } from '../src/domain.ts';

class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
function check(condition:unknown,status:number,message:string):asserts condition{if(!condition)throw new HttpError(status,message);}
const json=(v:string)=>JSON.parse(v);
const person=(row:Record<string,any>)=>({id:row.id,name:row.name,role:row.role,profile:json(row.profile)});
const today=()=>new Date().toISOString().slice(0,10);
type AuthRequest=Request & {user:Record<string,any>;session:Record<string,any>};
const short=z.string().trim().min(1).max(300);
const long=z.string().trim().min(1).max(6000);
const money=z.number().min(0).max(1e8);
const proposalSchema=z.object({value:money,startDate:date,endDate:date,terms:long,deliverables:z.array(z.object({title:short,due:date})).min(1).max(30)}).refine(v=>v.startDate<=v.endDate,'End date must follow start date').refine(v=>v.deliverables.every(d=>d.due>=v.startDate&&d.due<=v.endDate),'Deliverable dates must be within the agreement period');

export function createApp(db:DB,options:{origin?:string;secureCookie?:boolean}={}){
 const app=express(); const origin=options.origin||'http://127.0.0.1:3000';
 app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:false}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use(express.json({limit:'100kb'}));
 app.use('/api',(req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   if(req.get('origin')!==origin)return res.status(403).json({error:'Request origin is not allowed.'});
  }
  next();
 });
 const attempts=new Map<string,{count:number;until:number}>();
 app.post('/api/auth/login',(req,res)=>{
  const key=req.ip||'local'; const now=Date.now(); let attempt=attempts.get(key);
  if(!attempt||attempt.until<now){attempt={count:0,until:now+15*60*1000};attempts.set(key,attempt);}
  check(attempt.count<20,429,'Too many sign-in attempts. Try again in 15 minutes.'); attempt.count++;
  const data=z.object({email:z.email().max(254),password:z.string().min(1).max(200)}).parse(req.body);
  const user=one(db,'SELECT * FROM users WHERE email=?',data.email.toLowerCase());
  // Use a real stored hash even on unknown accounts to avoid a fast missing-user path.
  const fallback=one(db,'SELECT password_hash FROM users LIMIT 1');
  const valid=(user||fallback)&&verifyPassword(data.password,(user||fallback)!.password_hash);
  check(user&&valid,401,'Email or password is incorrect.');
  attempts.delete(key);
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  run(db,'DELETE FROM sessions WHERE expires_at < ?',now);
  const previous=req.headers.cookie?.match(/(?:^|;\s*)vtx_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(previous)run(db,'DELETE FROM sessions WHERE token_hash=?',hashToken(previous));
  run(db,'INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)',hashToken(token),user.id,csrf,now+7*86400000);
  res.cookie('vtx_session',token,{httpOnly:true,sameSite:'strict',secure:options.secureCookie||false,maxAge:7*86400000,path:'/'});
  res.json({user:{...person(user),email:user.email},csrf});
 });
 app.use('/api',(request,res,next)=>{
  const req=request as AuthRequest;
  const token=req.headers.cookie?.match(/(?:^|;\s*)vtx_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const session=token?one(db,'SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',hashToken(token),Date.now()):undefined;
  if(!session)return res.status(401).json({error:'Please sign in to continue.'});
  req.session=session;req.user=one(db,'SELECT * FROM users WHERE id=?',session.user_id)!;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('x-csrf-token')!==session.csrf)return res.status(403).json({error:'Your session needs to be refreshed. Please reload.'});
  next();
 });
 const route=(method:'get'|'post'|'patch'|'put'|'delete',path:string,handler:(req:AuthRequest,res:Response)=>any)=>app[method](path,(req,res)=>handler(req as AuthRequest,res));
 const role=(req:AuthRequest,r:string)=>check(req.user.role===r,403,'This action is not available for your account.');
 const event=(aid:string,actor:string,status:string,note:string)=>run(db,'INSERT INTO application_events(id,application_id,actor_id,status,note) VALUES (?,?,?,?,?)',id(),aid,actor,status,note);
 function application(req:AuthRequest,aid:string){
  const a=one(db,`SELECT a.*,o.brand_id,o.title AS offer_title,o.status AS offer_status,o.budget,o.deliverables AS offer_deliverables,o.start_date,o.end_date,o.type,ath.name AS athlete_name,b.name AS brand_name,ath.profile AS athlete_profile,b.profile AS brand_profile FROM applications a JOIN offers o ON o.id=a.offer_id JOIN users ath ON ath.id=a.athlete_id JOIN users b ON b.id=o.brand_id WHERE a.id=? AND (a.athlete_id=? OR o.brand_id=?)`,aid,req.user.id,req.user.id);
  check(a,404,'Application not found.');return a;
 }
 function sponsorship(req:AuthRequest,sid:string){
  const s=one(db,`SELECT s.*,p.value,p.start_date,p.end_date,p.terms,p.deliverables AS agreed_deliverables,a.athlete_id,o.brand_id,o.title AS offer_title,o.type,ath.name AS athlete_name,b.name AS brand_name FROM sponsorships s JOIN proposals p ON p.id=s.proposal_id JOIN applications a ON a.id=s.application_id JOIN offers o ON o.id=a.offer_id JOIN users ath ON ath.id=a.athlete_id JOIN users b ON b.id=o.brand_id WHERE s.id=? AND (a.athlete_id=? OR o.brand_id=?)`,sid,req.user.id,req.user.id);
  check(s,404,'Sponsorship not found.');return s;
 }
 function offerRow(req:AuthRequest,o:Record<string,any>){
  const own=o.brand_id===req.user.id;
  const mine=one(db,'SELECT id,status FROM applications WHERE offer_id=? AND athlete_id=?',o.id,req.user.id);
  return {id:o.id,brandId:o.brand_id,brandName:o.brand_name,brandProfile:json(o.brand_profile),title:o.title,description:o.description,sport:o.sport,region:o.region,values:json(o.values_json),type:o.type,budget:o.budget,deadline:o.deadline,startDate:o.start_date,endDate:o.end_date,deliverables:o.deliverables,status:o.status,createdAt:o.created_at,
   applicationCount:own?Number(one(db,'SELECT COUNT(*) AS n FROM applications WHERE offer_id=?',o.id)!.n):0,myApplicationId:mine?.id,myStatus:mine?.status,
   match:req.user.role==='athlete'?compatibility(json(req.user.profile),{sport:o.sport,region:o.region,values:json(o.values_json),type:o.type}):undefined};
 }
 route('get','/api/auth/me',(req,res)=>res.json({user:{...person(req.user),email:req.user.email},csrf:req.session.csrf}));
 route('post','/api/auth/logout',(req,res)=>{run(db,'DELETE FROM sessions WHERE token_hash=?',req.session.token_hash);res.clearCookie('vtx_session',{path:'/'});res.json({ok:true});});
 route('put','/api/profile',(req,res)=>{
  const data=z.object({name:short,profile:profileSchema}).parse(req.body);
  run(db,'UPDATE users SET name=?,profile=? WHERE id=?',data.name,JSON.stringify(data.profile),req.user.id);
  res.json({ok:true});
 });
 route('get','/api/people',(req,res)=>{
  const people=all(db,'SELECT id,name,role,profile FROM users WHERE role<>? ORDER BY name',req.user.role);
  res.json(people.map(p=>({...person(p),saved:!!one(db,'SELECT 1 FROM saved_profiles WHERE user_id=? AND target_id=?',req.user.id,p.id)})));
 });
 route('get','/api/people/:id',(req,res)=>{
  const p=one(db,'SELECT id,name,role,profile FROM users WHERE id=? AND (role<>? OR id=?)',String(req.params.id),req.user.role,req.user.id);check(p,404,'Profile not found.');res.json(person(p));
 });
 route('post','/api/people/:id/view',(req,res)=>{
  const p=one(db,'SELECT id FROM users WHERE id=? AND role<>?',String(req.params.id),req.user.role);check(p,404,'Profile not found.');
  run(db,'INSERT OR IGNORE INTO profile_views(viewer_id,target_id,date) VALUES (?,?,?)',req.user.id,p.id,today());res.json({ok:true});
 });
 route('post','/api/people/:id/save',(req,res)=>{
  const p=one(db,'SELECT id FROM users WHERE id=? AND role<>?',String(req.params.id),req.user.role);check(p,404,'Profile not found.');
  const {saved}=z.object({saved:z.boolean()}).parse(req.body);
  if(saved)run(db,'INSERT OR IGNORE INTO saved_profiles(user_id,target_id) VALUES (?,?)',req.user.id,p.id);else run(db,'DELETE FROM saved_profiles WHERE user_id=? AND target_id=?',req.user.id,p.id);
  res.json({ok:true});
 });
 route('get','/api/offers',(req,res)=>{
  const rows=all(db,`SELECT o.*,u.name AS brand_name,u.profile AS brand_profile FROM offers o JOIN users u ON u.id=o.brand_id WHERE ${req.user.role==='brand'?'o.brand_id=?':"o.status IN ('published','closed')"} ORDER BY o.created_at DESC,o.id`,...(req.user.role==='brand'?[req.user.id]:[]));
  res.json(rows.map(o=>offerRow(req,o)));
 });
 route('post','/api/offers',(req,res)=>{
  role(req,'brand');const d=offerSchema.parse(req.body);check(d.status!=='published'||d.deadline>=today(),422,'Choose a future application deadline.');const oid=id();
  run(db,'INSERT INTO offers(id,brand_id,title,description,sport,region,values_json,type,budget,deadline,start_date,end_date,deliverables,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',oid,req.user.id,d.title,d.description,d.sport,d.region,JSON.stringify(d.values),d.type,d.budget,d.deadline,d.startDate,d.endDate,d.deliverables,d.status);res.status(201).json({id:oid});
 });
 route('put','/api/offers/:id',(req,res)=>{
  role(req,'brand');const o=one(db,'SELECT * FROM offers WHERE id=? AND brand_id=?',String(req.params.id),req.user.id);check(o,404,'Offer not found.');
  const d=offerSchema.parse(req.body);check(d.status!=='published'||d.deadline>=today(),422,'Choose a future application deadline.');
  run(db,'UPDATE offers SET title=?,description=?,sport=?,region=?,values_json=?,type=?,budget=?,deadline=?,start_date=?,end_date=?,deliverables=?,status=? WHERE id=?',d.title,d.description,d.sport,d.region,JSON.stringify(d.values),d.type,d.budget,d.deadline,d.startDate,d.endDate,d.deliverables,d.status,o.id);res.json({ok:true});
 });
 route('post','/api/offers/:id/apply',(req,res)=>{
  role(req,'athlete');const {motivation}=z.object({motivation:long}).parse(req.body);
  const o=one(db,"SELECT * FROM offers WHERE id=? AND status='published'",String(req.params.id));check(o,404,'Open offer not found.');check(o.deadline>=today(),409,'This application deadline has passed.');
  check(!one(db,'SELECT id FROM applications WHERE offer_id=? AND athlete_id=?',o.id,req.user.id),409,'You have already applied to this offer.');
  const aid=id();transaction(db,()=>{run(db,'INSERT INTO applications(id,offer_id,athlete_id,motivation,status) VALUES (?,?,?,?,?)',aid,o.id,req.user.id,motivation,'submitted');event(aid,req.user.id,'submitted','Application submitted.');});res.status(201).json({id:aid});
 });
 route('get','/api/applications',(req,res)=>{
  res.json(all(db,`SELECT a.*,o.title AS offer_title,o.brand_id,o.type,ath.name AS athlete_name,b.name AS brand_name,
   (SELECT COUNT(*) FROM messages m WHERE m.application_id=a.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread,
   (SELECT text FROM messages m WHERE m.application_id=a.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AS last_message,
   COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.application_id=a.id),a.created_at) AS updated_at
   FROM applications a JOIN offers o ON o.id=a.offer_id JOIN users ath ON ath.id=a.athlete_id JOIN users b ON b.id=o.brand_id WHERE a.athlete_id=? OR o.brand_id=? ORDER BY updated_at DESC`,req.user.id,req.user.id,req.user.id));
 });
 route('get','/api/applications/:id',(req,res)=>{
  const a=application(req,String(req.params.id));
  res.json({...a,athlete_profile:json(a.athlete_profile),brand_profile:json(a.brand_profile),events:all(db,'SELECT e.*,u.name AS actor_name FROM application_events e JOIN users u ON u.id=e.actor_id WHERE application_id=? ORDER BY e.created_at,e.rowid',a.id),proposals:all(db,'SELECT * FROM proposals WHERE application_id=? ORDER BY created_at DESC,rowid DESC',a.id).map(p=>({...p,deliverables:json(p.deliverables)})),sponsorshipId:one(db,'SELECT id FROM sponsorships WHERE application_id=?',a.id)?.id});
 });
 route('patch','/api/applications/:id/status',(req,res)=>{
  const a=application(req,String(req.params.id));const d=z.object({status:z.enum(['reviewing','shortlisted','negotiating','rejected','withdrawn']),note:z.string().trim().max(2000).default('')}).parse(req.body);
  check(!['accepted','rejected','withdrawn'].includes(a.status),409,'This application is already closed.');
  if(req.user.role==='athlete')check(d.status==='withdrawn',403,'Athletes may only withdraw their own application.');else check(d.status!=='withdrawn',403,'Only the athlete can withdraw an application.');
  check(a.status!==d.status,409,'The application already has that status.');
  transaction(db,()=>{run(db,"UPDATE proposals SET status='superseded' WHERE application_id=? AND status='pending'",a.id);run(db,'UPDATE applications SET status=? WHERE id=?',d.status,a.id);event(a.id,req.user.id,d.status,d.note||'Application status updated.');});res.json({ok:true});
 });
 route('get','/api/applications/:id/messages',(req,res)=>{
  const a=application(req,String(req.params.id));res.json(all(db,'SELECT m.*,u.name AS sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE application_id=? ORDER BY m.created_at,m.rowid',a.id));
 });
 route('post','/api/applications/:id/read',(req,res)=>{const a=application(req,String(req.params.id));run(db,'UPDATE messages SET read_at=? WHERE application_id=? AND sender_id<>? AND read_at IS NULL',new Date().toISOString(),a.id,req.user.id);res.json({ok:true});});
 route('post','/api/applications/:id/messages',(req,res)=>{
  const a=application(req,String(req.params.id));const {text}=z.object({text:long}).parse(req.body);const mid=id();run(db,'INSERT INTO messages(id,application_id,sender_id,text) VALUES (?,?,?,?)',mid,a.id,req.user.id,text);res.status(201).json({id:mid});
 });
 route('post','/api/applications/:id/proposals',(req,res)=>{
  role(req,'brand');const a=application(req,String(req.params.id));check(!['accepted','rejected','withdrawn'].includes(a.status),409,'This application is already closed.');const d=proposalSchema.parse(req.body);const pid=id();
  transaction(db,()=>{run(db,"UPDATE proposals SET status='superseded' WHERE application_id=? AND status='pending'",a.id);run(db,'INSERT INTO proposals(id,application_id,value,start_date,end_date,terms,deliverables,status) VALUES (?,?,?,?,?,?,?,?)',pid,a.id,d.value,d.startDate,d.endDate,d.terms,JSON.stringify(d.deliverables),'pending');run(db,"UPDATE applications SET status='proposed' WHERE id=?",a.id);event(a.id,req.user.id,'proposed','The brand sent agreement terms for the athlete to review.');});res.status(201).json({id:pid});
 });
 route('post','/api/proposals/:id/respond',(req,res)=>{
  role(req,'athlete');const p=one(db,'SELECT * FROM proposals WHERE id=?',String(req.params.id));check(p,404,'Proposal not found.');const a=application(req,p.application_id);const {accept}=z.object({accept:z.boolean()}).parse(req.body);
  check(p.status==='pending'&&a.status==='proposed',409,'This proposal is no longer awaiting a response.');const sid=id();
  transaction(db,()=>{run(db,'UPDATE proposals SET status=? WHERE id=?',accept?'accepted':'declined',p.id);run(db,'UPDATE applications SET status=? WHERE id=?',accept?'accepted':'negotiating',a.id);event(a.id,req.user.id,accept?'accepted':'negotiating',accept?'The athlete accepted these terms. Sponsorship activated. This is not an electronic signature.':'The athlete requested further negotiation.');
   if(accept){run(db,'INSERT INTO sponsorships(id,application_id,proposal_id) VALUES (?,?,?)',sid,a.id,p.id);for(const d of json(p.deliverables))run(db,'INSERT INTO deliverables(id,sponsorship_id,title,due,status) VALUES (?,?,?,?,?)',id(),sid,d.title,d.due,'pending');}
  });res.json({sponsorshipId:accept?sid:null});
 });
 route('get','/api/sponsorships',(req,res)=>{
  const ids=all(db,'SELECT s.id FROM sponsorships s JOIN applications a ON a.id=s.application_id JOIN offers o ON o.id=a.offer_id WHERE a.athlete_id=? OR o.brand_id=? ORDER BY s.created_at DESC',req.user.id,req.user.id);
  res.json(ids.map(({id:sid})=>({...sponsorship(req,sid),deliverables:all(db,'SELECT * FROM deliverables WHERE sponsorship_id=? ORDER BY due,rowid',sid),contracts:all(db,'SELECT id,filename,note,created_at,uploaded_by FROM contracts WHERE sponsorship_id=? ORDER BY created_at DESC',sid),results:all(db,'SELECT r.*,u.name AS author_name FROM results r JOIN users u ON u.id=r.author_id WHERE sponsorship_id=? ORDER BY date DESC',sid)})));
 });
 route('patch','/api/sponsorships/:id',(req,res)=>{
  role(req,'brand');const s=sponsorship(req,String(req.params.id));const d=z.object({status:z.enum(['active','completed']),paid:money,paymentNote:z.string().trim().max(2000)}).parse(req.body);
  check(d.paid<=s.value,422,'Recorded payment cannot exceed the agreed value.');
  if(d.status==='completed')check(!one(db,"SELECT id FROM deliverables WHERE sponsorship_id=? AND status<>'approved'",s.id),409,'Approve all deliverables before completing the sponsorship.');
  run(db,'UPDATE sponsorships SET status=?,paid=?,payment_note=? WHERE id=?',d.status,d.paid,d.paymentNote,s.id);res.json({ok:true});
 });
 route('patch','/api/deliverables/:id',(req,res)=>{
  const d=one(db,'SELECT * FROM deliverables WHERE id=?',String(req.params.id));check(d,404,'Deliverable not found.');const s=sponsorship(req,d.sponsorship_id);check(s.status==='active',409,'This sponsorship is completed.');
  if(req.user.role==='athlete'){
   const data=z.object({evidenceUrl:url.refine(v=>!!v,'Add an evidence link'),note:z.string().trim().max(2000)}).parse(req.body);check(d.status!=='approved',409,'This deliverable is already approved.');
   run(db,"UPDATE deliverables SET status='submitted',evidence_url=?,note=?,review_note='',updated_at=? WHERE id=?",data.evidenceUrl,data.note,new Date().toISOString(),d.id);
  }else{
   const data=z.object({status:z.enum(['approved','changes_requested']),reviewNote:z.string().trim().max(2000)}).parse(req.body);check(d.status==='submitted',409,'The athlete must submit evidence before review.');check(data.status!=='changes_requested'||!!data.reviewNote,422,'Explain which changes are needed.');
   run(db,'UPDATE deliverables SET status=?,review_note=?,updated_at=? WHERE id=?',data.status,data.reviewNote,new Date().toISOString(),d.id);
  }res.json({ok:true});
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:1,fieldSize:3000}});
 app.post('/api/sponsorships/:id/contracts',upload.single('file'),(request,res)=>{
  const req=request as AuthRequest;const s=sponsorship(req,String(req.params.id));const file=req.file;
  check(file&&file.buffer.subarray(0,5).toString()==='%PDF-'&&file.mimetype==='application/pdf',422,'Choose a PDF document (up to 5 MB).');
  const note=z.string().trim().min(1).max(2000).parse(req.body.note);const cid=id();
  const filename=file.originalname.replace(/[^a-zA-Z0-9 ._-]/g,'_').slice(0,160)||'contract.pdf';
  run(db,'INSERT INTO contracts(id,sponsorship_id,uploaded_by,filename,document,note) VALUES (?,?,?,?,?,?)',cid,s.id,req.user.id,filename,file.buffer,note);res.status(201).json({id:cid});
 });
 route('get','/api/contracts/:id/download',(req,res)=>{
  const c=one(db,'SELECT * FROM contracts WHERE id=?',String(req.params.id));check(c,404,'Document not found.');sponsorship(req,c.sponsorship_id);
  res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${c.filename}"`,'Content-Security-Policy':"default-src 'none'; sandbox"});res.send(Buffer.from(c.document));
 });
 route('post','/api/sponsorships/:id/results',(req,res)=>{
  const s=sponsorship(req,String(req.params.id));const d=z.object({date,reach:z.number().int().min(0).max(1e10),engagements:z.number().int().min(0).max(1e10),sales:money,cost:money,source:short,note:z.string().trim().max(2000)}).parse(req.body);
  check(d.date<=today(),422,'Results cannot be dated in the future.');check(!one(db,'SELECT id FROM results WHERE sponsorship_id=? AND date=?',s.id,d.date),409,'A report already exists for that date. Use a different reporting period to avoid double counting.');
  const rid=id();run(db,'INSERT INTO results(id,sponsorship_id,author_id,date,reach,engagements,sales,cost,source,note) VALUES (?,?,?,?,?,?,?,?,?,?)',rid,s.id,req.user.id,d.date,d.reach,d.engagements,d.sales,d.cost,d.source,d.note);res.status(201).json({id:rid});
 });
 route('get','/api/dashboard',(req,res)=>{
  const isBrand=req.user.role==='brand';
  const apps=all(db,'SELECT a.status,COUNT(*) AS count FROM applications a JOIN offers o ON o.id=a.offer_id WHERE '+(isBrand?'o.brand_id=?':'a.athlete_id=?')+' GROUP BY a.status',req.user.id);
  const deals=one(db,'SELECT COUNT(*) AS count,COALESCE(SUM(p.value),0) AS value,COALESCE(SUM(s.paid),0) AS paid FROM sponsorships s JOIN proposals p ON p.id=s.proposal_id JOIN applications a ON a.id=s.application_id JOIN offers o ON o.id=a.offer_id WHERE '+(isBrand?'o.brand_id=?':'a.athlete_id=?')+" AND s.status='active'",req.user.id);
  const results=one(db,'SELECT COALESCE(SUM(r.reach),0) AS reach,COALESCE(SUM(r.engagements),0) AS engagements,COALESCE(SUM(r.sales),0) AS sales,COALESCE(SUM(r.cost),0) AS cost FROM results r JOIN sponsorships s ON s.id=r.sponsorship_id JOIN applications a ON a.id=s.application_id JOIN offers o ON o.id=a.offer_id WHERE '+(isBrand?'o.brand_id=?':'a.athlete_id=?'),req.user.id);
  res.json({applications:apps,deals,results,views:one(db,'SELECT COUNT(*) AS count FROM profile_views WHERE target_id=?',req.user.id)!.count,saved:one(db,'SELECT COUNT(*) AS count FROM saved_profiles WHERE target_id=?',req.user.id)!.count});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
 app.use((err:Error, _req:Request,res:Response,_next:NextFunction)=>{
  if(err instanceof z.ZodError)return res.status(422).json({error:err.issues.map(i=>`${i.path.join('.')||'Form'}: ${i.message}`).join('\n')});
  if(err instanceof HttpError)return res.status(err.status).json({error:err.message});
  if(err instanceof multer.MulterError)return res.status(422).json({error:err.code==='LIMIT_FILE_SIZE'?'PDF must be no larger than 5 MB.':'The upload could not be processed.'});
  if(err instanceof SyntaxError)return res.status(400).json({error:'Invalid request data.'});
  console.error(err);res.status(500).json({error:'Something went wrong. Please try again.'});
 });
 return app;
}
