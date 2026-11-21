import {transaction} from './db.js';
import {fail} from './http.js';
export async function reserveGeneration(db,{id,userId,kind,era=null,model,input}){
 return transaction(db,async tx=>{
  await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const existing=(await tx.query('SELECT id,user_id,kind,era,status,output FROM ai_generations WHERE id=$1',[id])).rows[0];
  if(existing){if(existing.user_id!==userId||existing.kind!==kind||existing.era!==era)fail(409,'Identificador no disponible');return {existing};}
  const count=(await tx.query("SELECT count(*) AS count FROM ai_generations WHERE user_id=$1 AND created_at>now()-interval '1 day'",[userId])).rows[0];if(Number(count.count)>=20)fail(429,'Límite diario de IA alcanzado');
  await tx.query("INSERT INTO ai_generations(id,user_id,kind,era,model,status,input) VALUES($1,$2,$3,$4,$5,'pending',$6)",[id,userId,kind,era,model,JSON.stringify(input)]);return {id};
 });
}
