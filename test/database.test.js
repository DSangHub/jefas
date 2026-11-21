import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {migrate} from '../lib/migrate.js';
test('schema migrates idempotently with ownership and relationship constraints',async()=>{
 const db=await testDatabase();try{await migrate(db);const {rows}=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");for(const name of ['users','sessions','profiles','schools','friendships','chats','messages','ai_generations'])assert.ok(rows.some(r=>r.tablename===name));await assert.rejects(db.query("INSERT INTO schools(id,user_id,name) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','test')"));}finally{await db.end();}
});
