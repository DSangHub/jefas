import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../lib/migrate.js';
export async function testDatabase(){
 const pg=new PGlite();
 const db={query:async(sql,params)=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};const r=await pg.query(sql,params);return {...r,rowCount:r.rows.length||r.affectedRows||0};},connect:async()=>({...db,release(){}}),end:()=>pg.close()};
 // PGlite's extended protocol only allows one statement. Migration SQL uses exec.
 const query=db.query;db.query=async(sql,params)=>{if(!params&&sql.includes(';')&&!sql.includes('pg_advisory_xact_lock')){await pg.exec(sql);return {rows:[],rowCount:0};}return query(sql,params);};
 await migrate(db);return db;
}
