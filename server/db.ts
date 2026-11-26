import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const id=()=>randomUUID();
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password:string,stored:string){const [salt,hash]=stored.split(':');const expected=Buffer.from(hash,'hex');return timingSafeEqual(scryptSync(password,salt,64),expected);}
export function openDatabase(path=process.env.DATABASE_PATH||'./data/vtx.sqlite') {
 if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
 const db=new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 const migrations=fileURLToPath(new URL('./migrations/',import.meta.url));
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
  if(!db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)){
   db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(resolve(migrations,name),'utf8'));db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
 }
 return db;
}
export type DB=ReturnType<typeof openDatabase>;
export const one=(db:DB,sql:string,...args:SQLInputValue[])=>db.prepare(sql).get(...args) as Record<string,any>|undefined;
export const all=(db:DB,sql:string,...args:SQLInputValue[])=>db.prepare(sql).all(...args) as Record<string,any>[];
export const run=(db:DB,sql:string,...args:SQLInputValue[])=>db.prepare(sql).run(...args);
export function transaction<T>(db:DB,fn:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
