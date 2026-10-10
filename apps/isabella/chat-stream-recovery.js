(()=>{'use strict';
/* Recover a finished Chat response, never regenerate one. A temporary receipt
 * is stored by isabella-chat before the final SSE event. Supabase RLS limits
 * this lookup to the authenticated owner and receipts less than 24h old.
 */
window.MINDS_CHAT_STREAM_RECOVERY=async function(requestId){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId||'')))return null;
  const sb=window.MINDS_SUPABASE;
  if(!sb)return null;
  for(let i=0;i<9;i++){
    try{
      const {data,error}=await sb.from('minds_chat_stream_delivery_receipts')
        .select('status,reply,incomplete_reason').eq('request_id',requestId).maybeSingle();
      if(!error&&data?.reply)return {
        reply:String(data.reply),
        incomplete:data.status!=='completed',
        incomplete_reason:data.status==='completed'?null:String(data.incomplete_reason||'unconfirmed_completion'),
        delivery_recovered:true
      };
      if(error?.code==='42P01'||error?.code==='42501')return null;
    }catch{}
    if(i<8)await new Promise(resolve=>setTimeout(resolve,1100));
  }
  return null;
};
})();
