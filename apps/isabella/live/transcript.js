// Live timestamps identify transcript fragments. A change of speaker, delegation
// boundary or a pause separates utterances. Only finished text goes to Window.
(()=>{
  'use strict';
  function turns({id,write,onError}){
    const seen=new Set(),pending=new Map(),owners=[];
    let active=null,queue=Promise.resolve();
    function flush(){
      if(active){
        const turn=active;active=null;
        if(turn.author==='gari')owners.push(turn);
        pending.set(turn.id,turn);
      }
      if(!pending.size)return;
      queue=queue.then(async()=>{
        for(const [key,row] of pending){
          try{await write({turn_id:key,author:row.author,text:row.text});pending.delete(key)}
          catch{
            try{await write({turn_id:key,author:row.author,text:row.text});pending.delete(key)}
            catch{onError?.();break}
          }
        }
      });
    }
    function add(author,event){
      if(!event.delta||typeof event.delta!=='string')return active;
      const at=Number.isFinite(event.start_ms)?event.start_ms:null;
      const key=event.event_id||(at!==null?JSON.stringify([author,at,event.end_ms,event.delta]):null);
      if(key&&seen.has(key))return active;
      if(key)seen.add(key);
      if(active&&(active.author!==author||(at!==null&&active.end!==null&&at-active.end>2000)))flush();
      if(!active)active={id:id(),author,text:'',start:at,end:at,delegated:false};
      active.text+=event.delta;active.end=Number.isFinite(event.end_ms)?event.end_ms:at;
      return active;
    }
    function ownerAt(offset){
      const candidate=[...owners,...(active?.author==='gari'?[active]:[])].reverse()
        .find(x=>x.start===null||!Number.isFinite(offset)||x.start<=offset);
      if(!candidate||candidate.delegated)return null;
      candidate.delegated=true;
      if(candidate===active)flush();
      return candidate;
    }
    return {add,ownerAt,finish(){flush();return queue}};
  }
  window.ISABELLA_LIVE_TRANSCRIPT=Object.freeze({turns});
})();
