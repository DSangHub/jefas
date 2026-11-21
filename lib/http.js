export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function json(res,status,data,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(data));}
export async function body(req,limit=3_000_000){
 const raw=await new Promise((resolve,reject)=>{let size=0,tooLarge=false;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>limit){if(!tooLarge){tooLarge=true;reject(Object.assign(new Error('Solicitud demasiado grande'),{status:413}));}return;}chunks.push(chunk);});req.on('end',()=>{if(!tooLarge)resolve(Buffer.concat(chunks).toString());});req.on('error',reject);});
 let data;try{data=JSON.parse(raw||'{}');}catch{fail(400,'JSON inválido');}if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Objeto JSON requerido');return data;
}
export function text(value,max=4000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,'Texto inválido');return value.trim();}
export function uuid(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||''))fail(400,'Identificador inválido');return value;}
export function sameOrigin(req){if(['GET','HEAD','OPTIONS'].includes(req.method))return;const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site')fail(403,'Origen no permitido');if(!origin){if(process.env.NODE_ENV==='production'||process.env.VERCEL)fail(403,'Origen requerido');return;}const expected=process.env.APP_ORIGIN||`${process.env.VERCEL?'https':'http'}://${req.headers.host}`;if(origin!==expected)fail(403,'Origen no permitido');}
