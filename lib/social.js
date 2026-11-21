import {randomUUID} from 'node:crypto';
import {body,fail,json,text,uuid} from './http.js';
export async function socialRoute(db,req,res,route,userId){
 if(route==='/api/schools'){
  if(req.method==='GET'){json(res,200,{schools:(await db.query('SELECT * FROM schools WHERE user_id=$1 ORDER BY created_at,id LIMIT 100',[userId])).rows});return true;}
  if(req.method==='POST'){const b=await body(req);const school=(await db.query('INSERT INTO schools(id,user_id,name) VALUES($1,$2,$3) RETURNING *',[randomUUID(),userId,text(b.name,160)])).rows[0];json(res,201,{school});return true;}
 }
 const schoolMatch=route.match(/^\/api\/schools\/([^/]+)$/);
 if(schoolMatch&&['PUT','DELETE'].includes(req.method)){
  const id=uuid(schoolMatch[1]);const result=req.method==='DELETE'?await db.query('DELETE FROM schools WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]):await db.query('UPDATE schools SET name=$3 WHERE id=$1 AND user_id=$2 RETURNING *',[id,userId,text((await body(req)).name,160)]);if(!result.rowCount)fail(404,'Escuela no encontrada');json(res,200,{school:result.rows[0]});return true;
 }
 if(route==='/api/friends'){
  if(req.method==='GET'){json(res,200,{friends:(await db.query('SELECT f.*,p.name FROM friendships f JOIN profiles p ON p.user_id=CASE WHEN f.requester_id=$1 THEN f.recipient_id ELSE f.requester_id END WHERE f.requester_id=$1 OR f.recipient_id=$1 ORDER BY f.created_at,f.id LIMIT 100',[userId])).rows});return true;}
  if(req.method==='POST'){
   const target=uuid((await body(req)).userId);if(target===userId)fail(400,'No puedes agregarte');
   if(!(await db.query('SELECT id FROM users WHERE id=$1',[target])).rowCount)fail(404,'Usuario no encontrado');
   try{const friendship=(await db.query('INSERT INTO friendships(id,requester_id,recipient_id) VALUES($1,$2,$3) RETURNING *',[randomUUID(),userId,target])).rows[0];json(res,201,{friendship});}catch(error){if(error.code==='23505')fail(409,'La relación ya existe');throw error;}return true;
  }
 }
 const match=route.match(/^\/api\/friends\/([^/]+)$/);
 if(match){const id=uuid(match[1]);
  if(req.method==='PUT'){const status=(await body(req)).status;if(!['accepted','rejected'].includes(status))fail(400,'Estado inválido');const result=await db.query("UPDATE friendships SET status=$3 WHERE id=$1 AND recipient_id=$2 AND status='pending' RETURNING *",[id,userId,status]);if(!result.rowCount)fail(404,'Solicitud no encontrada');json(res,200,{friendship:result.rows[0]});return true;}
  if(req.method==='DELETE'){const result=await db.query('DELETE FROM friendships WHERE id=$1 AND (requester_id=$2 OR recipient_id=$2) RETURNING id',[id,userId]);if(!result.rowCount)fail(404,'Relación no encontrada');json(res,200,{ok:true});return true;}
 }
 return false;
}
