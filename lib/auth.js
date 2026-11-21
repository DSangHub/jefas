import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {transaction} from './db.js';
import {body,fail,json,text} from './http.js';
const pbkdf2=promisify(crypto.pbkdf2);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const passwordHash=async(password,salt)=> (await pbkdf2(password,salt,210000,32,'sha256')).toString('hex');
function cookie(token,age=604800){return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function sessionToken(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sid='))?.slice(4);return /^[a-f0-9]{64}$/.test(token||'')?token:null;}
export async function userFor(db,req){const token=sessionToken(req);if(!token)return null;return (await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[digest(token)])).rows[0]?.user_id||null;}
async function session(db,userId,oldToken){await db.query('DELETE FROM sessions WHERE expires_at<now()');const token=crypto.randomBytes(32).toString('hex');if(oldToken)await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(oldToken)]);await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[digest(token),userId]);return token;}
export async function authRoute(db,req,res,route){
 if(req.method!=='POST')return false;
 if(route==='/api/auth/logout'){const token=sessionToken(req);if(token)await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);json(res,200,{ok:true},{'set-cookie':cookie('',0)});return true;}
 if(!['/api/auth/register','/api/auth/login'].includes(route))return false;
 const b=await body(req);const email=text(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Correo inválido');
 if(typeof b.password!=='string'||b.password.length<8||b.password.length>256)fail(400,'Contraseña de 8 a 256 caracteres requerida');
 const key=digest(email);const attempt=(await db.query("INSERT INTO auth_attempts(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.expires_at<now() THEN 1 ELSE auth_attempts.attempts+1 END, expires_at=CASE WHEN auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END RETURNING attempts",[key])).rows[0];if(attempt.attempts>10)fail(429,'Demasiados intentos. Espera 15 minutos.');
 let token;
 if(route.endsWith('register')){
  const userId=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex'),hash=await passwordHash(b.password,salt);
  try{token=await transaction(db,async tx=>{await tx.query('INSERT INTO users(id,email,salt,password_hash) VALUES($1,$2,$3,$4)',[userId,email,salt,hash]);await tx.query('INSERT INTO profiles(user_id,name) VALUES($1,$2)',[userId,b.name?text(b.name,80):'Jefa/Jefe']);return session(tx,userId,sessionToken(req));});}catch(error){if(error.code==='23505')fail(409,'Ese correo ya existe');throw error;}
 }else{
  const user=(await db.query('SELECT id,salt,password_hash FROM users WHERE email=$1',[email])).rows[0];const hash=await passwordHash(b.password,user?.salt||'00000000000000000000000000000000');if(!user||!crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(user.password_hash,'hex')))fail(401,'Credenciales incorrectas');token=await transaction(db,tx=>session(tx,user.id,sessionToken(req)));
 }
 await db.query('DELETE FROM auth_attempts WHERE key=$1',[key]);json(res,route.endsWith('register')?201:200,{ok:true},{'set-cookie':cookie(token)});return true;
}
