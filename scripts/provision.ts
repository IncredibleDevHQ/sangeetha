import 'dotenv/config';
import { database } from '../src/server/db';
import { provisionOwner } from '../src/server/admin-service';
async function main(){const [name,channel,value,slug]=process.argv.slice(2);if(!name || !['email','phone'].includes(channel)||!value)throw Error('Usage: npm run provision -- "School name" email teacher@example.com');const db=await database();try{console.log('School provisioned:',await provisionOwner(db,name,channel as 'email'|'phone',value,slug));}finally{await db.close();}}main().catch(e=>{console.error(e.message);process.exitCode=1;});
