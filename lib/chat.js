import {reserveGeneration} from './generations.js';
import {randomUUID} from 'node:crypto';
import {body,fail,json,text,uuid} from './http.js';
import {transaction} from './db.js';
import {providerConfig,askAI,callConnector} from './providers.js';
export async function canChat(db,id,userId){return (await db.query('SELECT * FROM chats WHERE id=$1 AND (user_id=$2 OR friend_id=$2)',[id,userId])).rows[0];}
const bossFor=t=>/dinero|cuenta|presupuesto|gasto|pago|ahorro|deuda/i.test(t)?'sofia':/haz|reserva|cita|envía|paga|compra|prox/i.test(t)?'valentina':'isabella';
export async function chatRoute(db,req,res,route,userId,fetcher){
 if(route==='/api/chats'){
  if(req.method==='GET'){json(res,200,{chats:(await db.query('SELECT * FROM chats WHERE user_id=$1 OR friend_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[userId])).rows});return true;}
  if(req.method==='POST'){const b=await body(req);const friend=b.friendId?uuid(b.friendId):null;if(friend&&!(await db.query("SELECT id FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND recipient_id=$2) OR (recipient_id=$1 AND requester_id=$2))",[userId,friend])).rowCount)fail(403,'Se requiere una amistad aceptada');const chat=(await db.query('INSERT INTO chats(id,user_id,friend_id,title) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),userId,friend,b.title?text(b.title,160):''])).rows[0];json(res,201,{chat});return true;}
 }
 const match=route.match(/^\/api\/chats\/([^/]+)\/messages$/);
 if(match){const chat=await canChat(db,uuid(match[1]),userId);if(!chat)fail(404,'Chat no encontrado');
  if(req.method==='GET'){const before=new URL(req.url,'http://localhost').searchParams.get('before');if(before&&Number.isNaN(Date.parse(before)))fail(400,'Fecha inválida');json(res,200,{messages:(await db.query('SELECT * FROM messages WHERE chat_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2) ORDER BY created_at DESC,id DESC LIMIT 100',[chat.id,before])).rows.reverse()});return true;}
  if(req.method==='POST'){const content=text((await body(req)).content);const message=(await db.query("INSERT INTO messages(id,chat_id,user_id,role,content) VALUES($1,$2,$3,'user',$4) RETURNING *",[randomUUID(),chat.id,userId,content])).rows[0];json(res,201,{message});return true;}
 }
 if(route==='/api/chat'&&req.method==='POST'){
  const b=await body(req),message=text(b.message),boss=bossFor(message);
  if(/paga|transfiere|compra|envía|cancela|elimina|firma|reserva/i.test(message)){const approval=(await db.query('INSERT INTO approvals(id,user_id,request) VALUES($1,$2,$3) RETURNING *',[randomUUID(),userId,message])).rows[0];json(res,202,{boss,approval,reply:'Esta acción necesita tu aprobación antes de continuar.'});return true;}
  const p=(await db.query('SELECT provider FROM profiles WHERE user_id=$1',[userId])).rows[0];const provider=b.provider||p.provider,cfg=providerConfig(provider);let chat;
  if(b.chatId){chat=await canChat(db,uuid(b.chatId),userId);if(!chat||chat.friend_id||chat.user_id!==userId)fail(404,'Chat privado no encontrado');}
  else chat=(await db.query('INSERT INTO chats(id,user_id,title) VALUES($1,$2,$3) RETURNING *',[randomUUID(),userId,message.slice(0,80)])).rows[0];
  const generationId=randomUUID();await reserveGeneration(db,{id:generationId,userId,kind:'chat',model:cfg.model,input:{message,chatId:chat.id}});
  try{const reply=await askAI(fetcher,provider,cfg,message,boss);await transaction(db,async tx=>{for(const [role,content] of [['user',message],['assistant',reply]])await tx.query('INSERT INTO messages(id,chat_id,user_id,role,content) VALUES($1,$2,$3,$4,$5)',[randomUUID(),chat.id,userId,role,content]);await tx.query("UPDATE ai_generations SET status='completed',output=$3 WHERE id=$1 AND user_id=$2",[generationId,userId,JSON.stringify({reply})]);});json(res,200,{boss,reply,chatId:chat.id,generationId});}catch(error){await db.query("UPDATE ai_generations SET status='failed',error='AI request failed' WHERE id=$1 AND user_id=$2",[generationId,userId]);throw error;}return true;
 }
 if(route==='/api/approvals'&&req.method==='GET'){json(res,200,{approvals:(await db.query("SELECT * FROM approvals WHERE user_id=$1 AND status='pending' ORDER BY created_at LIMIT 100",[userId])).rows});return true;}
 const approvalMatch=route.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
 if(approvalMatch&&req.method==='POST'){
  const id=uuid(approvalMatch[1]),action=approvalMatch[2];const approval=(await db.query("UPDATE approvals SET status=$3 WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *",[id,userId,action==='reject'?'rejected':'processing'])).rows[0];if(!approval)fail(409,'Aprobación no disponible');
  if(action==='reject'){json(res,200,{approval});return true;}
  try{const result=await callConnector(fetcher,/skorup/i.test(approval.request)?'skorup':'proxic',{request:approval.request,userId,idempotencyKey:id});await db.query("UPDATE approvals SET status='approved',result=$3 WHERE id=$1 AND user_id=$2",[id,userId,JSON.stringify(result)]);json(res,200,{approval:{...approval,status:'approved'},result});}catch(error){await db.query("UPDATE approvals SET status='failed' WHERE id=$1 AND user_id=$2",[id,userId]);throw error;}return true;
 }
 if(route==='/api/connectors/test'&&req.method==='POST'){const name=(await body(req)).connector;json(res,200,{result:await callConnector(fetcher,name,{request:'health-check',dryRun:true,userId})});return true;}
 return false;
}
