import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {testDatabase} from './helpers.js';
import {createHandler} from '../lib/app.js';
import {fixture,request,register} from './http-helpers.js';
test('persistent hashed sessions, authentication, expiry, logout and CSRF',async()=>{const f=await fixture();try{
 assert.equal((await request(f.base,'/api/private')).status,401);assert.equal((await request(f.base,'/app')).status,302);
 const cookie=await register(f.base);const stored=(await f.db.query('SELECT * FROM sessions')).rows[0];assert.ok(!cookie.includes(stored.token_hash));
 const server=http.createServer(createHandler({db:f.db}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{assert.equal((await request(`http://127.0.0.1:${server.address().port}`,'/app',{cookie})).status,200);}finally{await new Promise(r=>server.close(r));}
 assert.equal((await request(f.base,'/api/auth/logout',{cookie,method:'POST',origin:'https://evil.example'})).status,403);
 assert.equal((await request(f.base,'/api/auth/login',{method:'POST',data:{email:'one@example.test',password:'wrong-password'}})).status,401);
 const login=await request(f.base,'/api/auth/login',{method:'POST',data:{email:'one@example.test',password:'example-password-123'}});assert.equal(login.status,200);
 await f.db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");assert.equal((await request(f.base,'/api/private',{cookie})).status,401);
 assert.equal((await request(f.base,'/api/auth/logout',{cookie,method:'POST'})).status,200);
 }finally{await f.close();}});
