import { all, id, one, passwordHash, run, transaction, type DB } from './db.ts';
import type { Profile } from '../src/domain.ts';

export const DEMO_PASSWORD='DemoVTX2026!';
const base:Profile={headline:'',location:'',region:'Spain',bio:'',sports:[],values:['Sustainability','Community'],website:'https://example.com',contact:'',availability:'Available for the 2027 season',lookingFor:['Ambassador','Product','Content','Event','Sponsorship'],socials:[],audience:'',training:'',competitions:[],experience:[],sector:'',teamSize:'',level:'Semi-pro'};
const athletes=[
 ['lucia','Lucía Ferrer','Valencia','Triathlon','Trail running'],['marta','Marta Soler','Barcelona','Triathlon','Swimming'],
 ['iker','Iker Soto','Pamplona','Trail running','Ultra trail'],['sofia','Sofía Llorens','Andorra','Ultra trail','Trail running'],
 ['diego','Diego Torres','Madrid','Road running','Triathlon'],['nerea','Nerea Aguirre','Bilbao','Climbing','Trail running'],
 ['carla','Carla Vidal','Girona','Cycling','Road running'],['alex','Alex Romero','Madrid','Road running','Cycling'],
 ['elena','Elena Costa','Lisbon','Swimming','Triathlon'],['javi','Javi Ortega','Granada','Trail running','Ultra trail']
];
const brands=[
 ['vertice','Vértice Running','Madrid','Running footwear','Trail running','Adventure'],
 ['aqualis','Aqualis Swim','Barcelona','Swimming & wetsuits','Swimming','Performance'],
 ['nordpeak','Nordpeak Outdoor','Andorra','Mountain & outdoor','Ultra trail','Adventure'],
 ['fuelix','Fuelix Nutrition','Valencia','Sports nutrition','Any endurance','Community'],
 ['strata','Strata Bikes','Girona','Cycling & equipment','Cycling','Performance']
];
export function seed(db:DB){
 if(one(db,'SELECT id FROM users LIMIT 1'))return false;
 transaction(db,()=>{
 const hash=passwordHash(DEMO_PASSWORD);
 athletes.forEach(([slug,name,city,sport,second],i)=>{
  const p:Profile={...base,headline:`${sport} athlete · ${second} enthusiast`,location:city,region:city==='Andorra'?'Andorra':city==='Lisbon'?'Portugal':'Spain',sports:[sport,second],values:[i%2?'Performance':'Sustainability','Community',i%3?'Adventure':"Women’s sport"],
   bio:`I’m ${name}, an endurance athlete based in ${city}. My season combines ${sport.toLowerCase()} racing with consistent training and time with my local community. I share practical preparation, honest equipment feedback and the stories behind race day. I’m looking for thoughtful partnerships that fit my sports, values and calendar. This is a fully synthetic demonstration profile.`,
   contact:`${slug}@vtx.test`,socials:[{network:'Instagram',handle:`@${slug}.endurance`,url:'https://example.com/instagram',followers:12500+i*3100,engagement:4.1+i*.2},{network:'Strava',handle:name,url:'https://example.com/strava',followers:800+i*170,engagement:0}],
   audience:`Declared demo audience: ${60+i}% Spain, ages 25–44; endurance and outdoor interests.`,training:`Declared demo data: ${7+i} hours/week, 5 training days, ${40+i*5} km/week. No device connected.`,
   competitions:[{year:2026,name:`${city} endurance challenge`,result:`${i+2}th in category`,url:'https://example.com/results'},{year:2025,name:'Mediterranean endurance series',result:'Finisher · personal best',url:'https://example.com/results'}],
   experience:[{name:'Local Endurance Collective',role:'Community ambassador',period:'2025 – 2026',description:'Synthetic collaboration: community training sessions, product feedback and six race-day stories.'}],level:i%3===0?'Pro':i%3===1?'Semi-pro':'Amateur'};
  run(db,'INSERT INTO users(id,email,password_hash,role,name,profile) VALUES (?,?,?,?,?,?)',`athlete-${slug}`,`${slug}@vtx.test`,hash,'athlete',name,JSON.stringify(p));
 });
 brands.forEach(([slug,name,city,sector,sport,value],i)=>{
  const p:Profile={...base,headline:`Made for the long way · ${sector}`,location:city,region:city==='Andorra'?'Andorra':'Spain',sports:sport==='Any endurance'?['Trail running','Road running','Triathlon']: [sport],values:['Sustainability',value,'Community'],
   bio:`${name} is a synthetic ${sector.toLowerCase()} brand based in ${city}. We partner with endurance athletes who bring curiosity, consistency and a strong connection to their communities. Our collaborations cover product testing, useful content and local events. We value clear briefs, fair terms and honest feedback.`,
   contact:`${slug}@vtx.test`,sector,teamSize:`${12+i*8} people`,level:'',audience:'Endurance athletes and outdoor communities in Spain and Portugal.',training:'',socials:[{network:'Instagram',handle:`@${slug}.sport`,url:'https://example.com/brand',followers:35000+i*8500,engagement:3.2}],
   experience:[{name:'Endurance community programme',role:'Brand partner',period:'2025 – 2026',description:'Synthetic programme supporting local clubs, product testing and inclusive race participation.'}]};
  run(db,'INSERT INTO users(id,email,password_hash,role,name,profile) VALUES (?,?,?,?,?,?)',`brand-${slug}`,`${slug}@vtx.test`,hash,'brand',name,JSON.stringify(p));
  for(let j=0;j<2;j++)run(db,`INSERT INTO offers(id,brand_id,title,description,sport,region,values_json,type,budget,deadline,start_date,end_date,deliverables,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
   `offer-${slug}-${j}`,`brand-${slug}`,j?`${name} product field test`:`${name} · 2027 ambassador team`,
   j?'Test our next collection in real training conditions. Share thoughtful, honest feedback and create useful content for your community. Product and expenses are included in the stated collaboration value.':'Join a season-long partnership built around your race calendar. We are looking for athletes with a clear voice, consistent training and a commitment to their community. Together we will agree content, race appearances and equipment support.',
   sport,i===2?'Anywhere':'Spain',JSON.stringify(['Sustainability',value]),j?'Product':'Ambassador',j?1200+i*300:8000+i*1500,'2027-06-01','2027-07-01','2027-12-31',j?'One training review with a public evidence link\nOne detailed product feedback report':'Two Instagram posts per month\nOne race-day story\nEnd-of-season report','published');
 });
 // Different real database states, all explicitly synthetic. Acceptance still happens through the API for new deals.
 const examples=[['lucia','vertice',0,'negotiating'],['lucia','fuelix',1,'accepted'],['marta','aqualis',0,'shortlisted'],['iker','vertice',0,'reviewing'],['sofia','nordpeak',0,'submitted'],['carla','strata',0,'accepted'],['javi','fuelix',0,'submitted'],['diego','fuelix',1,'rejected']] as const;
 examples.forEach(([ath,brand,j,status])=>{
  const aid=`application-${ath}-${brand}`;
  run(db,'INSERT INTO applications(id,offer_id,athlete_id,motivation,status) VALUES (?,?,?,?,?)',aid,`offer-${brand}-${j}`,`athlete-${ath}`,'I would love to bring my race calendar, practical feedback and community perspective to this collaboration. Synthetic demonstration application.',status);
  run(db,'INSERT INTO application_events(id,application_id,actor_id,status,note) VALUES (?,?,?,?,?)',id(),aid,`athlete-${ath}`,'submitted','Synthetic demo application created.');
  if(status!=='submitted')run(db,'INSERT INTO application_events(id,application_id,actor_id,status,note) VALUES (?,?,?,?,?)',id(),aid,`brand-${brand}`,status,'Synthetic demo state.');
  run(db,'INSERT INTO messages(id,application_id,sender_id,text) VALUES (?,?,?,?)',id(),aid,`brand-${brand}`,'Thanks for your interest. Let’s talk about your plans for the season. This conversation is synthetic demo data.');
  if(status==='accepted'){
   const pid=`proposal-${ath}-${brand}`,sid=`sponsorship-${ath}-${brand}`;
   run(db,'INSERT INTO proposals(id,application_id,value,start_date,end_date,terms,deliverables,status) VALUES (?,?,?,?,?,?,?,?)',pid,aid,brand==='strata'?9000:1800,'2026-11-01','2027-02-28','Synthetic agreed terms: equipment and content partnership. Payment recorded manually; no payment processor.',JSON.stringify([{title:'Training field review',due:'2026-12-15'},{title:'Community race-day post',due:'2027-01-15'},{title:'End-of-season report',due:'2027-02-28'}]),'accepted');
   run(db,'INSERT INTO sponsorships(id,application_id,proposal_id,paid,payment_note) VALUES (?,?,?,?,?)',sid,aid,pid,brand==='strata'?2000:600,'Synthetic demo payment record; no money moved.');
   for(const [k,title,due] of [[0,'Training field review','2026-12-15'],[1,'Community race-day post','2027-01-15'],[2,'End-of-season report','2027-02-28']] as const)run(db,'INSERT INTO deliverables(id,sponsorship_id,title,due,status,evidence_url,note) VALUES (?,?,?,?,?,?,?)',`deliverable-${ath}-${k}`,sid,title,due,k===0?'submitted':'pending',k===0?'https://example.com/demo-review':'',k===0?'Synthetic evidence link for review.':'');
   run(db,'INSERT INTO results(id,sponsorship_id,author_id,date,reach,engagements,sales,cost,source,note) VALUES (?,?,?,?,?,?,?,?,?,?)',id(),sid,`brand-${brand}`,'2026-11-20',12000,740,2600,900,'Synthetic demo report · manually entered','Example period total. No attribution integration; no actual sales.');
  }
 });
 });
 return true;
}
export function demoAccounts(db:DB){return all(db,'SELECT email,role,name FROM users ORDER BY role,name');}
