import {database} from '../lib/db.js';
import {migrate} from '../lib/migrate.js';
const db=database();
try{await migrate(db);console.log('Database migrations applied');}catch{console.error('Database migration failed; check database connectivity and migration permissions.');process.exitCode=1;}finally{await db.end();}
