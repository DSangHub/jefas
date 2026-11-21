import {photoRoute} from './photo-lab.js';
import {chatRoute} from './chat.js';
import {socialRoute} from './social.js';
import {profileRoute} from './profiles.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {database} from './db.js';
import {authRoute,userFor} from './auth.js';
import {fail,json,sameOrigin} from './http.js';
export function createHandler({db,fetcher=fetch}={}){return async(req,res)=>{try{
 const route=new URL(req.url,'http://localhost').pathname;
 if(route.startsWith('/api/')){
  sameOrigin(req);const store=db||database();
  if(await authRoute(store,req,res,route))return;
  const userId=await userFor(store,req);if(!userId)fail(401,'Inicia sesión');
  if(await profileRoute(store,req,res,route,userId))return;
  if(await socialRoute(store,req,res,route,userId))return;
  if(await chatRoute(store,req,res,route,userId,fetcher))return;
  if(await photoRoute(store,req,res,route,userId,fetcher))return;
  fail(404,'Ruta no encontrada');
 }
 if(route==='/app'&&!(await userFor(db||database(),req))){res.writeHead(302,{location:'/'});return res.end();}
 const files={'/':'index.html','/app':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/photo-lab-api.js':'photo-lab-api.js'};
 const file=files[route];if(!file)fail(404,'No encontrado');
 const data=await readFile(path.join(process.cwd(),'public',file));
 res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(file)],'x-content-type-options':'nosniff','referrer-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'cache-control':'no-store'});res.end(data);
 }catch(error){const status=error.status||(error.code==='ENOENT'?404:500);if(status>=500)console.error('Request failed',{code:error.code||'INTERNAL',status});json(res,status,{error:status>=500?'Servicio no disponible. Intenta de nuevo más tarde.':error.message});}};}
