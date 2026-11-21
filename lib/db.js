import pg from 'pg';
let pool;
export function database() {
 if (!process.env.DATABASE_URL) throw Object.assign(new Error('Base de datos no configurada'), {status:503});
 pool ??= new pg.Pool({connectionString:process.env.DATABASE_URL, max:3, connectionTimeoutMillis:10000, idleTimeoutMillis:10000});
 return pool;
}
export async function transaction(db, fn) {
 const client=await db.connect();
 try {await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();}
}
