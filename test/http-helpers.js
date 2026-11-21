import assert from 'node:assert/strict';
import http from 'node:http';
import {testDatabase} from './helpers.js';
import {createHandler} from '../lib/app.js';
export async function fixture(options={}){const db=await testDatabase();const server=http.createServer(createHandler({db,...options}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;return {db,base,close:async()=>{await new Promise(r=>server.close(r));await db.end();}};}
export async function request(base,path,{cookie,method='GET',data,origin}={}){return fetch(base+path,{method,redirect:'manual',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},...(data?{body:JSON.stringify(data)}:{})});}
export async function register(base,email='one@example.test'){const r=await request(base,'/api/auth/register',{method:'POST',data:{email,password:'example-password-123',name:'Test'}});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0];}
