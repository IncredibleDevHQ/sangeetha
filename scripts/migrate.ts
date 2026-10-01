import 'dotenv/config';
import { database,migrate } from '../src/server/db';
async function main(){const db=await database();try{await migrate(db);console.log('Migrations applied.');}finally{await db.close();}}main().catch(e=>{console.error(e.message);process.exitCode=1;});
