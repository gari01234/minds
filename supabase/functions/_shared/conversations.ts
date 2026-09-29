import {checked} from './cognitive.ts';
const endpoint='https://api.openai.com/v1/conversations';
async function api(apiKey:string,url:string,body?:any){
  const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const p=await r.json();if(!r.ok)throw new Error(p?.error?.message||'conversation_api_failed');return p;
}
export function removeInjectedContext(text:string){
  let result=String(text||'');
  // Only remove the exact trailing JSON wrapper inserted by older MINDS clients.
  for(const tag of ['CONTEXTO_PRIVADO','CONTEXTO_READINGS']){
    const marker=`\n\n<${tag}>\n`,end=`\n</${tag}>`;
    const at=result.lastIndexOf(marker);
    if(at>=0&&result.endsWith(end)){
      try{const v=JSON.parse(result.slice(at+marker.length,-end.length));if(v&&typeof v==='object')result=result.slice(0,at)}catch{/* User-authored text is untouched. */}
    }
  }
  return result;
}
export async function listAllItems(apiKey:string,id:string){
  const rows:any[]=[];let after='';
  do{
    const p=await api(apiKey,`${endpoint}/${encodeURIComponent(id)}/items?order=asc&limit=100&include[]=message.input_image.image_url${after?'&after='+encodeURIComponent(after):''}`);
    rows.push(...(p.data||[]));
    if(!p.has_more)break;
    const next=p.last_id||p.data?.at(-1)?.id;
    if(!next||next===after)throw new Error('conversation_pagination_incomplete');after=next;
  }while(true);
  return rows;
}
export async function cleanLegacyConversation(sb:any,apiKey:string,row:any,token:string){
  const old=row.metadata?.openai_conversation_id;
  if(!old||row.metadata?.context_policy==='transient_v1')return {id:old,changed:false};
  const rows=await listAllItems(apiKey,old);let removed=0;
  const items=rows.map(item=>{
    if(item.type!=='message'||item.role!=='user')return {type:'item_reference',id:item.id};
    let changed=false;
    const content=(item.content||[]).map((part:any)=>{
      if(!['input_text','text'].includes(part.type))return part;
      const clean=removeInjectedContext(part.text);
      if(clean!==part.text){changed=true;removed+=part.text.length-clean.length;}
      return {type:'input_text',text:clean};
    });
    return changed?{type:'message',role:'user',content}:{type:'item_reference',id:item.id};
  });
  let id=old;
  if(removed){
    const created=await api(apiKey,endpoint,{metadata:{app:String(row.app_scope),source_conversation:String(old),supabase_conversation_id:String(row.id)}});id=created.id;
    for(let i=0;i<items.length;i+=20)await api(apiKey,`${endpoint}/${id}/items`,{items:items.slice(i,i+20)});
    const copied=await listAllItems(apiKey,id);
    if(copied.length!==rows.length)throw new Error('conversation_copy_count_mismatch');
    const tail=await api(apiKey,`${endpoint}/${old}/items?order=desc&limit=1`);
    if(tail.data?.[0]?.id!==rows.at(-1)?.id)throw new Error('conversation_changed_during_copy');
  }
  const metadata={...(row.metadata||{}),openai_conversation_id:id,context_policy:'transient_v1',context_migration:{at:new Date().toISOString(),items:rows.length,removed_context_chars:removed},...(id!==old?{openai_conversation_archive:[...(row.metadata?.openai_conversation_archive||[]),{id:old,reason:'transient_context_cleanup',at:new Date().toISOString()}]}:{})};
  const saved=checked(await sb.from('conversations').update({metadata}).eq('id',row.id).eq('runtime_lease_token',token).select('id'),'conversation_switch');
  if(!saved?.length)throw new Error('conversation_lease_lost');
  return {id,changed:id!==old,removed_context_chars:removed,items:rows.length};
}
export async function openConversation(sb:any,apiKey:string,row:any,seed:any[]){
  const token=crypto.randomUUID();
  if(!checked(await sb.rpc('minds_lock_conversation',{p_id:row.id,p_token:token}),'conversation_lock'))throw new Error('Hay otra respuesta en curso. Espera a que termine e inténtalo de nuevo.');
  try{
    row=checked(await sb.from('conversations').select('id,metadata,app_scope').eq('id',row.id).single(),'conversation_read');
    let id=row.metadata?.openai_conversation_id;
    if(!id){
      const created=await api(apiKey,endpoint,{metadata:{app:String(row.app_scope),supabase_conversation_id:String(row.id)}});id=created.id;
      const items=(seed||[]).filter(m=>m.content&&['user','assistant'].includes(m.role)).map(m=>({type:'message',role:m.role,content:String(m.content)}));
      for(let i=0;i<items.length;i+=20)await api(apiKey,`${endpoint}/${id}/items`,{items:items.slice(i,i+20)});
      checked(await sb.from('conversations').update({metadata:{...(row.metadata||{}),openai_conversation_id:id,context_policy:'transient_v1'}}).eq('id',row.id).eq('runtime_lease_token',token),'conversation_create_save');
    }
    // Legacy cleanup is performed by heartbeat while holding the same lease.
    return {id,dbId:row.id,dbConversationId:row.id,leaseToken:token};
  }catch(e){await closeConversation(sb,{dbId:row.id,leaseToken:token});throw e;}
}
export async function closeConversation(sb:any,conv:any){
  if(!sb||!conv?.leaseToken)return;
  const r=await sb.rpc('minds_unlock_conversation',{p_id:conv.dbId,p_token:conv.leaseToken});
  if(r.error)console.error('conversation_unlock_failed',r.error.message);
}
