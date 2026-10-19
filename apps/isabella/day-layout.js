/* Build 99B: deterministic overlapping event lanes for native Day. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MINDS_DAY_LAYOUT=api;
})(typeof window==='undefined'?null:window,function(){
'use strict';
const clock=x=>{const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(x||''));return m?Number(m[1])*60+Number(m[2]):null};
function layout(events=[]){
  const valid=events.map(e=>({event:e,start:clock(e.start),duration:Number(e.duration)}))
    .filter(x=>x.start!==null&&Number.isFinite(x.duration)&&x.duration>0&&x.duration<=1440)
    .map(x=>({...x,end:x.start+x.duration}))
    .sort((a,b)=>a.start-b.start||a.end-b.end||String(a.event.id).localeCompare(String(b.event.id)));
  const groups=[];let cluster=[],far=-1;
  for(const x of valid){
    if(cluster.length&&x.start>=far){groups.push(cluster);cluster=[];far=-1}
    cluster.push(x);far=Math.max(far,x.end);
  }
  if(cluster.length)groups.push(cluster);
  const output=new Map();
  for(const group of groups){
    const lanes=[];
    const placed=[];
    for(const item of group){
      let lane=lanes.findIndex(end=>end<=item.start);
      if(lane<0){lane=lanes.length;lanes.push(item.end)}
      else lanes[lane]=item.end;
      placed.push({item,lane});
    }
    const count=lanes.length;
    for(const {item,lane} of placed){
      output.set(item.event.id,{lane,columns:count,top:item.start-420,
        height:item.duration-2,minutes:item.start,duration:item.duration});
    }
  }
  return output;
}
return {clock,layout};
});