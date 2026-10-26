/* MINDS · Shared calendar color projection v0.1
 * Pure presentation. No writes, permissions, network requests or inference.
 * The full Time calendar and Isabella's month glance consume the same colors.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MINDS_CALENDAR_COLORS=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const palette=Object.freeze(['#5A9EC1','#6D7278','#8A72C7','#D08A6A','#9A9466','#2F6FB0','#4F8A62','#B678A2']);
  function fallbackColor(seed=''){
    let hash=0;
    for(const char of String(seed))hash=(hash*31+char.charCodeAt(0))>>>0;
    return palette[hash%palette.length];
  }
  function itemColor(state,item){
    if(item?.projectId){
      const project=(state?.projects||[]).find(p=>p.id===item.projectId);
      if(project?.color)return project.color;
    }
    if(item?.categoryId){
      const category=(state?.categories||[]).find(c=>c.id===item.categoryId);
      if(category?.color)return category.color;
    }
    return fallbackColor(item?.projectId||item?.categoryId||item?.id||'item');
  }
  function colorsForItems(state,items,limit=4){
    return [...new Set((items||[]).map(item=>itemColor(state,item)).filter(Boolean))]
      .slice(0,Math.max(0,Math.min(4,Number(limit)||4)));
  }
  function colorsForDay(state,key){
    const events=(state?.events||[]).filter(e=>e.date===key);
    const tasks=(state?.tasks||[]).filter(t=>t.date===key&&!t.archivedAt);
    return colorsForItems(state,[...events,...tasks]);
  }
  return Object.freeze({itemColor,colorsForItems,colorsForDay,fallbackColor});
});
