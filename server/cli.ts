import { openDatabase } from './db.ts';
import { seed, demoAccounts, DEMO_PASSWORD } from './seed.ts';
try { process.loadEnvFile(); } catch {}
const db=openDatabase();
if(process.argv[2]==='seed'){console.log(seed(db)?'Created 10 synthetic athletes and 5 brands.':'Database already contains users; left unchanged.');console.table(demoAccounts(db));console.log('Demo password:',DEMO_PASSWORD);}
else console.log('Migrations applied.');
db.close();
