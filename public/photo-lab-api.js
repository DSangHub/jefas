// Adapter for the existing four-era UI. Never accepts provider keys or endpoints.
export async function generatePhoto({era,image,requestId=crypto.randomUUID(),onState=()=>{}}){
 onState('loading');
 try{const r=await fetch('/api/photo-lab/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({era,image,requestId})});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo generar la imagen');onState(data.generation.status);return data.generation;}catch(error){onState('error');throw error;}
}
export async function getGeneration(id){const r=await fetch('/api/generations/'+encodeURIComponent(id));const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo cargar la generación');return data.generation;}
