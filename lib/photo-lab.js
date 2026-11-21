import {createHash} from 'node:crypto';
import {body,fail,json,text,uuid} from './http.js';
import {reserveGeneration} from './generations.js';
export function photoEras(){const eras=(process.env.PHOTO_LAB_ERAS||'').split(',').map(e=>e.trim()).filter(Boolean);if(eras.length!==4||new Set(eras).size!==4||eras.some(e=>e.length>80))fail(503,'Photo Lab requiere configurar sus cuatro épocas');return eras;}
export async function photoRoute(db,req,res,route,userId,fetcher){
 if(route==='/api/photo-lab/config'&&req.method==='GET'){json(res,200,{eras:photoEras()});return true;}
 if(route==='/api/generations'&&req.method==='GET'){json(res,200,{generations:(await db.query('SELECT id,kind,era,model,status,error,created_at FROM ai_generations WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[userId])).rows});return true;}
 const match=route.match(/^\/api\/generations\/([^/]+)$/);
 if(match&&req.method==='GET'){
  const id=uuid(match[1]);await db.query("UPDATE ai_generations SET status='failed',error='Generation interrupted; submit a new request' WHERE id=$1 AND user_id=$2 AND status='pending' AND created_at<now()-interval '5 minutes'",[id,userId]);
  const generation=(await db.query('SELECT id,kind,era,model,status,output,error,created_at FROM ai_generations WHERE id=$1 AND user_id=$2',[id,userId])).rows[0];if(!generation)fail(404,'Generación no encontrada');json(res,200,{generation});return true;
 }
 if(route!=='/api/photo-lab/generate'||req.method!=='POST')return false;
 const b=await body(req),era=text(b.era,80);if(!photoEras().includes(era))fail(400,'Época inválida');
 const id=uuid(b.requestId);const image=typeof b.image==='string'?b.image:'';
 const parts=image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!parts||parts[2].length>2_800_000)fail(400,'Usa una imagen PNG, JPEG o WebP de hasta 2 MB');
 const bytes=Buffer.from(parts[2],'base64');const valid=parts[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):parts[1]==='jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid||bytes.length>2_000_000)fail(400,'Imagen inválida');
 const key=process.env.OPENAI_API_KEY;if(!key)fail(503,'Photo Lab no está configurado en el servidor');const model=process.env.PHOTO_LAB_MODEL||'gpt-image-2.5-sunburst';
 const reservation=await reserveGeneration(db,{id,userId,kind:'photo',era,model,input:{imageHash:createHash('sha256').update(bytes).digest('hex')}});
 if(reservation.existing){json(res,reservation.existing.status==='pending'?202:200,{generation:{id,status:reservation.existing.status,output:reservation.existing.output}});return true;}
 try{
  const form=new FormData();form.set('model',model);form.set('prompt',`Create a tasteful portrait of the person in the supplied photograph, styled for this historical era: ${era}. Preserve the person's identity. Do not add text.`);form.set('image[]',new Blob([bytes],{type:'image/'+parts[1]}),'portrait.'+parts[1]);form.set('output_format','png');form.set('size','1024x1024');form.set('n','1');
  const r=await fetcher('https://api.openai.com/v1/images/edits',{method:'POST',headers:{authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(120000)});if(!r.ok)fail(502,'No se pudo generar la imagen');const result=await r.json(),encoded=result.data?.[0]?.b64_json;if(typeof encoded!=='string'||encoded.length>4_000_000||!Buffer.from(encoded,'base64').subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))fail(502,'Respuesta de imagen inválida');
  const output={image:'data:image/png;base64,'+encoded};await db.query("UPDATE ai_generations SET status='completed',output=$3 WHERE id=$1 AND user_id=$2",[id,userId,JSON.stringify(output)]);json(res,201,{generation:{id,status:'completed',output}});
 }catch(error){await db.query("UPDATE ai_generations SET status='failed',error='Photo generation failed' WHERE id=$1 AND user_id=$2",[id,userId]);if(error.status)throw error;fail(502,'No se pudo generar la imagen. Intenta de nuevo.');}
 return true;
}
