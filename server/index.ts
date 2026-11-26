import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { openDatabase } from './db.ts';
try{process.loadEnvFile();}catch{}
const db=openDatabase();
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000),origin=process.env.APP_ORIGIN||`http://${host}:${port}`;
const app=createApp(db,{origin,secureCookie:process.env.COOKIE_SECURE==='true'});
if(process.argv.includes('--production')){
 const {default:express}=await import('express');
 app.use(express.static(resolve('dist')));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
}else{
 const {createServer}=await import('vite');
 const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const server=app.listen(port,host,()=>console.log(`VTX Athlete · Local: ${origin}\nSynthetic demo data · run npm run db:seed once before signing in.`));
function close(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
