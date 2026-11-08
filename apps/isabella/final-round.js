(()=>{
  'use strict';
  async function read(response,onDelta){
    if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json();
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer='',final,full='';
    const frame=raw=>{
      const lines=raw.split(/\r?\n/);
      const kind=lines.find(x=>x.startsWith('event:'))?.slice(6).trim();
      const data=lines.filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
      if(!data)return;
      const value=JSON.parse(data);
      if(kind==='delta'&&typeof value.text==='string'){full+=value.text;onDelta?.(value.text,full)}
      if(kind==='final'||kind==='error')final=value;
    };
    try{
      while(true){
        const {done,value}=await reader.read();
        buffer+=done?decoder.decode()+'\n\n':decoder.decode(value,{stream:true});
        let match;
        while((match=/\r?\n\r?\n/.exec(buffer))){frame(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length)}
        if(done||final)break;
      }
    }finally{reader.releaseLock()}
    if(!final)throw new Error('missing_final');
    return final;
  }
  async function ask({send,recover,onDelta,onReset}){
    try{return await read(await send(),onDelta)}
    catch{
      onReset?.();
      const saved=await recover();
      if(saved)return saved;
      throw new Error('La conexión se interrumpió y todavía no hay un resultado verificable. Revisa el chat antes de repetir la petición.');
    }
  }
  window.ISABELLA_FINAL_ROUND=Object.freeze({ask,read});
})();
