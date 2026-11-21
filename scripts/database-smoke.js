import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import {database} from '../lib/db.js';
import {createHandler} from '../lib/app.js';
// This check runs only against the isolated preview DB, never production.
if(process.env.VERCEL_ENV==='preview'){
 const db=database(),servers=[],emails=[0,1].map(()=>`smoke-${randomUUID()}@example.invalid`);
 const password=randomBytes(32).toString('hex');let stage='startup';
 async function start(){const server=http.createServer(createHandler({db}));await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);return `http://127.0.0.1:${server.address().port}`;}
 async function req(base,route,{method='GET',cookie,data}={}){return fetch(base+route,{method,redirect:'manual',headers:{'content-type':'application/json',origin:process.env.APP_ORIGIN||base.replace('http:','https:'),...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});}
 try{
  const base=await start();stage='registration';const cookies=[];
  for(const email of emails){const r=await req(base,'/api/auth/register',{method:'POST',data:{email,password,name:'Preview smoke'}});assert.equal(r.status,201);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
  const [a,b]=cookies;stage='session across instances';const second=await start();const me=await req(second,'/api/me',{cookie:a});assert.equal(me.status,200);assert.equal((await me.json()).profile.name,'Preview smoke');
  stage='profile persistence';assert.equal((await req(base,'/api/profile',{cookie:a,method:'PUT',data:{name:'Persistent',language:'es-MX',voice:false,provider:'openai'}})).status,200);assert.equal((await (await req(second,'/api/me',{cookie:a})).json()).profile.name,'Persistent');
  stage='schools and ownership';const sr=await req(base,'/api/schools',{cookie:a,method:'POST',data:{name:'Preview school'}});assert.equal(sr.status,201);const school=(await sr.json()).school;assert.equal((await req(second,'/api/schools/'+school.id,{cookie:b,method:'DELETE'})).status,404);
  stage='friendship and chat';const target=(await (await req(base,'/api/me',{cookie:b})).json()).profile.userId;const fr=await req(base,'/api/friends',{cookie:a,method:'POST',data:{userId:target}});assert.equal(fr.status,201);const rel=(await fr.json()).friendship;assert.equal((await req(base,'/api/friends/'+rel.id,{cookie:b,method:'PUT',data:{status:'accepted'}})).status,200);
  const cr=await req(base,'/api/chats',{cookie:a,method:'POST',data:{friendId:target}});assert.equal(cr.status,201);const chat=(await cr.json()).chat;
  assert.equal((await req(base,`/api/chats/${chat.id}/messages`,{cookie:a,method:'POST',data:{content:'Preview persistence check'}})).status,201);assert.equal((await (await req(second,`/api/chats/${chat.id}/messages`,{cookie:b})).json()).messages[0].content,'Preview persistence check');
  stage='logout revocation';assert.equal((await req(base,'/api/auth/logout',{cookie:a,method:'POST'})).status,200);assert.equal((await req(second,'/api/me',{cookie:a})).status,401);
  console.log('Hosted preview DB smoke passed: registration, cross-instance sessions, profiles, ownership, friendship, chat and logout.');
 }catch{console.error('Hosted preview DB smoke failed at: '+stage);process.exitCode=1;}
 finally{
  for(const server of servers)await new Promise(r=>server.close(r));
  try{await db.query('DELETE FROM users WHERE email=ANY($1::text[])',[emails]);await db.query('DELETE FROM auth_attempts WHERE key=ANY($1::text[])',[emails.map(e=>createHash('sha256').update(e).digest('hex'))]);}catch{console.error('Preview smoke cleanup failed');process.exitCode=1;}
  await db.end();
 }
}
