import {fail} from './http.js';
export function providerConfig(provider){
 const map={openai:{base:'https://api.openai.com/v1',model:process.env.OPENAI_MODEL||'gpt-4o-mini'},gemini:{base:'https://generativelanguage.googleapis.com/v1beta/openai',model:process.env.GEMINI_MODEL||'gemini-2.5-flash'},anthropic:{base:'https://api.anthropic.com/v1',model:process.env.ANTHROPIC_MODEL}};
 if(!map[provider])fail(400,'Proveedor inválido');const key=process.env[provider.toUpperCase()+'_API_KEY'];if(!key||!map[provider].model)fail(503,'Proveedor no configurado en el servidor');return {...map[provider],key};
}
export async function askAI(fetcher,provider,cfg,message,boss){
 const system=`Eres ${boss}, una de las Jefas de Jefas.app. Responde en español claro y breve. Nunca afirmes que ejecutaste una acción externa si no fue confirmada por una herramienta.`;
 const anthropic=provider==='anthropic';
 const r=await fetcher(cfg.base+(anthropic?'/messages':'/chat/completions'),{method:'POST',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json',...(anthropic?{'x-api-key':cfg.key,'anthropic-version':'2023-06-01'}:{authorization:`Bearer ${cfg.key}`})},body:JSON.stringify(anthropic?{model:cfg.model,max_tokens:700,system,messages:[{role:'user',content:message}]}:{model:cfg.model,messages:[{role:'system',content:system},{role:'user',content:message}],max_tokens:700})});
 if(!r.ok)fail(502,'El proveedor no pudo responder');const j=await r.json();const reply=anthropic?j.content?.map(x=>x.text||'').join(''):j.choices?.[0]?.message?.content;if(typeof reply!=='string'||!reply)fail(502,'Respuesta del proveedor inválida');return reply;
}
export async function callConnector(fetcher,name,payload){
 if(!['proxic','skorup'].includes(name))fail(400,'Conector inválido');const upper=name.toUpperCase(),key=process.env[upper+'_API_KEY'],base=process.env[upper+'_BASE_URL'];if(!key||!base)fail(503,'Conector no configurado');if(new URL(base).protocol!=='https:')fail(503,'Conector requiere HTTPS');
 const r=await fetcher(base.replace(/\/$/,'')+'/tasks',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify(payload)});if(!r.ok)fail(502,'El conector no pudo completar la acción');return r.json();
}
