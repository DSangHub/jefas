import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP_SECRET = process.env.APP_SECRET || 'development-only-change-me-please-32';
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const sessions = new Map();
const defaults = { users: [], profiles: [], keys: [], approvals: [], conversations: [] };
// Local JSON storage is only suitable for the standalone development server.
// Vercel instances cannot persist or share this file.
if (!process.env.VERCEL) {
 await mkdir(path.dirname(DB_FILE), { recursive: true });
 if (!existsSync(DB_FILE)) await writeFile(DB_FILE, JSON.stringify(defaults, null, 2));
}

const readDB = async () => ({ ...defaults, ...JSON.parse(await readFile(DB_FILE, 'utf8')) });
const saveDB = async db => writeFile(DB_FILE, JSON.stringify(db, null, 2));
const id = () => crypto.randomUUID();
const json = (res, status, body, headers={}) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8', ...headers}); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve,reject)=>{ let d=''; req.on('data',c=>{d+=c;if(d.length>1e6)reject(Error('Payload demasiado grande'));}); req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Error('JSON inválido'))}}); });
const cookies = req => Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>v.trim().split('=').map(decodeURIComponent)));
const currentUser = req => sessions.get(cookies(req).sid)?.userId;
const hashPassword = (password, salt=crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.pbkdf2Sync(password,salt,120000,32,'sha256').toString('hex') });
const verifyPassword = (password, user) => crypto.timingSafeEqual(Buffer.from(user.hash,'hex'), Buffer.from(hashPassword(password,user.salt).hash,'hex'));
const encKey = crypto.createHash('sha256').update(APP_SECRET).digest();
const encrypt = text => { const iv=crypto.randomBytes(12); const c=crypto.createCipheriv('aes-256-gcm',encKey,iv); const out=Buffer.concat([c.update(text,'utf8'),c.final()]); return [iv,c.getAuthTag(),out].map(x=>x.toString('base64')).join('.'); };
const decrypt = text => { const [a,b,c]=text.split('.').map(x=>Buffer.from(x,'base64')); const d=crypto.createDecipheriv('aes-256-gcm',encKey,a); d.setAuthTag(b); return Buffer.concat([d.update(c),d.final()]).toString('utf8'); };
const auth = (req,res) => { const userId=currentUser(req); if(!userId){json(res,401,{error:'Inicia sesión'});return null;} return userId; };
const env = name => process.env[name] || '';

function providerConfig(provider, db, userId){
 const stored=db.keys.find(k=>k.userId===userId&&k.provider===provider);
 const key=stored?decrypt(stored.secret):env(provider.toUpperCase()+'_API_KEY');
 const map={
  openai:{base:env('OPENAI_BASE_URL')||'https://api.openai.com/v1',model:env('OPENAI_MODEL')||'gpt-4o-mini'},
  gemini:{base:env('GEMINI_BASE_URL')||'https://generativelanguage.googleapis.com/v1beta/openai',model:env('GEMINI_MODEL')||'gemini-2.5-flash'},
  anthropic:{base:env('ANTHROPIC_BASE_URL')||'https://api.anthropic.com/v1',model:env('ANTHROPIC_MODEL')||'claude-3-5-haiku-latest'}
 };
 return {...map[provider],key};
}
function detectBoss(text){ const t=text.toLowerCase(); if(/dinero|cuenta|presupuesto|gasto|pago|ahorro|deuda/.test(t))return 'sofia'; if(/haz|reserva|cita|envía|paga|compra|prox/i.test(t))return 'valentina'; return 'isabella'; }
function risky(text){ return /paga|transfiere|compra|envía|cancela|elimina|firma|reserva/i.test(text); }
async function askAI(provider, cfg, message, boss){
 const system=`Eres ${boss}, una de las Jefas de Jefas.app. Responde en español claro, breve y por voz. Nunca afirmes que ejecutaste una acción externa si no fue confirmada por una herramienta.`;
 if(provider==='anthropic'){
  const r=await fetch(cfg.base+'/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:cfg.model,max_tokens:700,system,messages:[{role:'user',content:message}]})});
  const j=await r.json(); if(!r.ok)throw Error(j.error?.message||'Error Anthropic'); return j.content?.map(x=>x.text||'').join('')||'Sin respuesta';
 }
 const r=await fetch(cfg.base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${cfg.key}`},body:JSON.stringify({model:cfg.model,messages:[{role:'system',content:system},{role:'user',content:message}],temperature:.4})});
 const j=await r.json(); if(!r.ok)throw Error(j.error?.message||`Error ${provider}`); return j.choices?.[0]?.message?.content||'Sin respuesta';
}
async function callConnector(name, db, userId, payload){
 const upper=name.toUpperCase(); const stored=db.keys.find(k=>k.userId===userId&&k.provider===name);
 const key=stored?decrypt(stored.secret):env(upper+'_API_KEY'); const base=env(upper+'_BASE_URL');
 if(!base||!key) throw Error(`${name} no está configurado`);
 const r=await fetch(base.replace(/\/$/,'')+'/tasks',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`},body:JSON.stringify(payload)});
 const j=await r.json().catch(()=>({})); if(!r.ok)throw Error(j.error||`${name} respondió ${r.status}`); return j;
}

const server=http.createServer(async(req,res)=>{ try{
 const u=new URL(req.url,`http://${req.headers.host}`); const route=u.pathname;
 if(process.env.VERCEL&&route.startsWith('/api/'))return json(res,503,{error:'Las cuentas aún no están disponibles. Falta configurar una base de datos persistente y el secreto del servidor.'});
 if(req.method==='POST'&&route==='/api/auth/register'){
  const b=await body(req), db=await readDB(); if(!b.email||!b.password||b.password.length<8)return json(res,400,{error:'Correo y contraseña de 8+ caracteres requeridos'});
  if(db.users.some(x=>x.email===b.email.toLowerCase()))return json(res,409,{error:'Ese correo ya existe'});
  const hp=hashPassword(b.password), user={id:id(),email:b.email.toLowerCase(),...hp,createdAt:new Date().toISOString()}; db.users.push(user); db.profiles.push({userId:user.id,name:b.name||'Jefa/Jefe',language:'es-MX',voice:true,provider:'openai'}); await saveDB(db);
  const sid=id(); sessions.set(sid,{userId:user.id}); return json(res,201,{ok:true},{'set-cookie':`sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`});
 }
 if(req.method==='POST'&&route==='/api/auth/login'){
  const b=await body(req),db=await readDB(),user=db.users.find(x=>x.email===String(b.email).toLowerCase()); if(!user||!verifyPassword(b.password||'',user))return json(res,401,{error:'Credenciales incorrectas'});
  const sid=id();sessions.set(sid,{userId:user.id});return json(res,200,{ok:true},{'set-cookie':`sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`});
 }
 if(req.method==='POST'&&route==='/api/auth/logout'){sessions.delete(cookies(req).sid);return json(res,200,{ok:true},{'set-cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
 if(route.startsWith('/api/')){
  const userId=auth(req,res);if(!userId)return;const db=await readDB();
  if(req.method==='GET'&&route==='/api/me'){const p=db.profiles.find(x=>x.userId===userId);const configured=['openai','gemini','anthropic','proxic','skorup'].filter(provider=>db.keys.some(k=>k.userId===userId&&k.provider===provider)||env(provider.toUpperCase()+'_API_KEY'));return json(res,200,{profile:p,configured});}
  if(req.method==='PUT'&&route==='/api/profile'){const b=await body(req),p=db.profiles.find(x=>x.userId===userId);Object.assign(p,{name:String(b.name||p.name).slice(0,80),language:b.language||'es-MX',voice:b.voice!==false,provider:['openai','gemini','anthropic'].includes(b.provider)?b.provider:p.provider});await saveDB(db);return json(res,200,{profile:p});}
  if(req.method==='POST'&&route==='/api/keys'){const b=await body(req);if(!['openai','gemini','anthropic','proxic','skorup'].includes(b.provider)||!b.key)return json(res,400,{error:'Proveedor o clave inválida'});db.keys=db.keys.filter(k=>!(k.userId===userId&&k.provider===b.provider));db.keys.push({id:id(),userId,provider:b.provider,secret:encrypt(String(b.key)),createdAt:new Date().toISOString()});await saveDB(db);return json(res,201,{ok:true});}
  if(req.method==='DELETE'&&route.startsWith('/api/keys/')){const provider=route.split('/').pop();db.keys=db.keys.filter(k=>!(k.userId===userId&&k.provider===provider));await saveDB(db);return json(res,200,{ok:true});}
  if(req.method==='POST'&&route==='/api/chat'){const b=await body(req),p=db.profiles.find(x=>x.userId===userId),boss=detectBoss(b.message||'');if(risky(b.message||'')){const a={id:id(),userId,type:'ai-action',request:b.message,status:'pending',createdAt:new Date().toISOString()};db.approvals.push(a);await saveDB(db);return json(res,202,{boss,approval:a,reply:'Esta acción necesita tu aprobación antes de continuar.'});}const provider=b.provider||p.provider,cfg=providerConfig(provider,db,userId);if(!cfg?.key)return json(res,400,{error:`Agrega tu clave de ${provider} en Configuración`});const reply=await askAI(provider,cfg,b.message,boss);db.conversations.push({id:id(),userId,boss,provider,message:b.message,reply,createdAt:new Date().toISOString()});await saveDB(db);return json(res,200,{boss,reply});}
  if(req.method==='GET'&&route==='/api/approvals')return json(res,200,{approvals:db.approvals.filter(x=>x.userId===userId&&x.status==='pending')});
  if(req.method==='POST'&&/^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(route)){const [, , , aid,action]=route.split('/'),a=db.approvals.find(x=>x.id===aid&&x.userId===userId);if(!a)return json(res,404,{error:'No encontrada'});a.status=action==='approve'?'approved':'rejected';let result=null;if(a.status==='approved'){const target=/skorup/i.test(a.request)?'skorup':'proxic';result=await callConnector(target,db,userId,{request:a.request,userId});a.result=result;}await saveDB(db);return json(res,200,{approval:a,result});}
  if(req.method==='POST'&&route==='/api/connectors/test'){const b=await body(req);const result=await callConnector(b.connector,db,userId,{request:'health-check',dryRun:true});return json(res,200,{result});}
  return json(res,404,{error:'Ruta no encontrada'});
 }
 let file=route==='/'?'index.html':route.slice(1); file=path.normalize(file).replace(/^(\.\.[/\\])+/, ''); const fp=path.join(__dirname,'public',file); if(!fp.startsWith(path.join(__dirname,'public')))return json(res,403,{error:'Prohibido'});
 const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}; const data=await readFile(fp);res.writeHead(200,{'content-type':types[path.extname(fp)]||'application/octet-stream'});res.end(data);
 }catch(e){ if(e.code==='ENOENT')return json(res,404,{error:'No encontrado'}); console.error(e);json(res,500,{error:e.message||'Error interno'}); }});
server.listen(PORT,()=>console.log(`Jefas.app en http://localhost:${PORT}`));
