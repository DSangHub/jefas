import {body,fail,json,text} from './http.js';
const providers=['openai','gemini','anthropic'];
export async function profileRoute(db,req,res,route,userId){
 if(req.method==='GET'&&route==='/api/me'){
  const profile=(await db.query('SELECT user_id AS "userId",name,language,voice,provider FROM profiles WHERE user_id=$1',[userId])).rows[0];
  const configured=[...providers,'proxic','skorup'].filter(p=>Boolean(process.env[p.toUpperCase()+'_API_KEY']));json(res,200,{profile,configured});return true;
 }
 if(req.method==='PUT'&&route==='/api/profile'){
  const b=await body(req);const name=text(b.name,80);if(!providers.includes(b.provider)||typeof b.voice!=='boolean'||!['es-MX','es','en-US'].includes(b.language))fail(400,'Perfil inválido');
  const profile=(await db.query('UPDATE profiles SET name=$2,language=$3,voice=$4,provider=$5 WHERE user_id=$1 RETURNING user_id AS "userId",name,language,voice,provider',[userId,name,b.language,b.voice,b.provider])).rows[0];json(res,200,{profile});return true;
 }
 if(route==='/api/keys'||route.startsWith('/api/keys/'))fail(405,'Las claves se configuran únicamente en el servidor');
 return false;
}
