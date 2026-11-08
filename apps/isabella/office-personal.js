// Source-of-truth: Window repo; Office-only per-member controls for Romy.
// The Window profile exits without side effects. Only authenticated owner rows
// are read; forgetting uses a server-side RPC with independent owner checks.
(()=>{
'use strict';
if(typeof window==='undefined'||window.APP_PROFILE!=='office')return;
const sb=window.MINDS_SUPABASE;
if(!sb)return;
let ownerId=null,serial=0,busy=false;
const t=(tag,label='',className='')=>{
  const e=document.createElement(tag);if(label)e.textContent=String(label);
  if(className)e.className=className;return e;
};
function container(){
  window.ISABELLA_APP?.openModal?.('Was Romy über mich weiß','');
  const body=document.getElementById('modalBody');
  if(body)body.replaceChildren();
  return body;
}
async function activeOwner(){
  const {data,error}=await sb.auth.getSession();
  const id=!error?data?.session?.user?.id:null;
  if(!id)return null;
  const {data:member,error:memberError}=await sb.from('office_members')
    .select('is_active,must_change_password')
    .eq('user_id',id).maybeSingle();
  return !memberError&&member?.is_active===true&&!member.must_change_password?id:null;
}
async function assertOwner(){
  const id=await activeOwner();
  if(!id||ownerId!==id)throw new Error('Sitzung geändert. Bitte erneut anmelden.');
  return id;
}
async function readOwnerPreference(id){
  const {data,error}=await sb.from('isabella_preferences').select('value')
    .eq('user_id',id).eq('preference_key','assistant').maybeSingle();
  if(error)throw error;
  return data?.value&&typeof data.value==='object'&&!Array.isArray(data.value)?data.value:{};
}
async function setPresence(enabled){
  const id=await assertOwner();
  const value=await readOwnerPreference(id);
  await assertOwner();
  const next={...value,curiosityEnabled:enabled===true};
  const {error}=await sb.from('isabella_preferences').upsert({
    user_id:id,preference_key:'assistant',value:next,
    status:'confirmed',confidence:1,evidence:[{source:'explicit_user_setting',kind:'presence_opt_in'}],updated_at:new Date().toISOString()
  },{onConflict:'user_id,preference_key'});
  if(error)throw error;
  return (await readOwnerPreference(id)).curiosityEnabled===enabled;
}
async function ownerMemories(id){
  const [memories,claims,entities]=await Promise.all([
    sb.from('isabella_memories').select('id,content,client_key,created_at')
      .eq('user_id',id).eq('status','active').order('created_at',{ascending:false}).limit(100),
    sb.from('isabella_model_claims').select('id,claim,status')
      .eq('user_id',id).in('status',['confirmed','hypothesis']).limit(100),
    sb.from('isabella_entities').select('id,name,entity_type,metadata')
      .eq('user_id',id).is('metadata->>forgotten_at',null).limit(100)
  ]);
  for(const response of [memories,claims,entities])if(response.error)throw response.error;
  return [
    ...(memories.data||[]).map(x=>({kind:'memory',id:x.id,label:x.content})),
    ...(claims.data||[]).map(x=>({kind:'claim',id:x.id,label:x.claim})),
    ...(entities.data||[]).filter(x=>x.metadata?.page).map(x=>({kind:'entity',id:x.id,label:x.name}))
  ].filter(x=>x.id&&x.label);
}
async function forget(kind,id){
  if(!['memory','claim','entity'].includes(kind)||!id)return false;
  await assertOwner();
  const {data,error}=await sb.rpc('office_romy_forget_private_memory',{p_kind:kind,p_id:id});
  if(error||data?.status!=='forgotten')throw error||new Error('Entfernung nicht bestätigt.');
  return true;
}
async function openPanel(){
  if(busy)return;
  busy=true;
  const seq=++serial;
  const body=container();
  if(!body){busy=false;return}
  body.appendChild(t('p','Persönliche Erinnerungen gehören nur zu deinem Konto. Die Projektakte ist davon getrennt.'));
  body.appendChild(t('p','Lade persönliche Angaben …'));
  try{
    const id=await activeOwner();
    if(!id)throw new Error('Bitte im Office anmelden.');
    if(ownerId!==id)ownerId=id;
    const [value,items]=await Promise.all([readOwnerPreference(id),ownerMemories(id)]);
    if(seq!==serial||await activeOwner()!==id)return;
    body.replaceChildren();
    const heading=t('h3','Meine persönlichen Einstellungen');body.appendChild(heading);
    const label=t('label','Romy darf mir von sich aus schreiben');
    const toggle=t('input');toggle.type='checkbox';toggle.checked=value.curiosityEnabled!==false;
    toggle.setAttribute('aria-label','Romy darf mir von sich aus schreiben');
    label.prepend(toggle);
    body.appendChild(label);
    body.appendChild(t('p','Die Begrenzung und Ruhezeiten gelten pro Person. Keine Office-Push-Mitteilungen.'));
    toggle.addEventListener('change',async()=>{
      toggle.disabled=true;
      try{
        if(!await setPresence(toggle.checked))throw new Error('Speicherung nicht bestätigt');
      }catch(e){toggle.checked=!toggle.checked;body.appendChild(t('p','Nicht gespeichert: '+String(e?.message||e)));}
      finally{toggle.disabled=false}
    });
    body.appendChild(t('h3','Was Romy sich gemerkt hat'));
    if(!items.length)body.appendChild(t('p','Noch keine gespeicherten Einträge.'));
    for(const item of items){
      const line=t('div',null,'office-personal-memory-row');
      line.appendChild(t('span',String(item.label).slice(0,1000)));
      const del=t('button','Vergessen','secondary');del.type='button';
      del.setAttribute('aria-label','Persönlichen Eintrag vergessen');
      del.addEventListener('click',async()=>{
        if(!window.confirm('Diesen persönlichen Eintrag samt verknüpfter Erinnerung vergessen?'))return;
        del.disabled=true;
        try{
          await assertOwner();
          if(await forget(item.kind,item.id)){line.remove();}
        }catch{del.disabled=false;body.appendChild(t('p','Nicht gelöscht: Der Server hat die Änderung nicht bestätigt.'));}
      });
      line.appendChild(del);body.appendChild(line);
    }
    body.appendChild(t('p','Anzeigen und Vergessen beziehen sich auf gespeicherte Erinnerungen, nicht auf das vollständige Gesprächsarchiv.'));
  }catch(e){
    if(seq===serial){body.replaceChildren();body.appendChild(t('p',String(e?.message||'Persönliche Daten derzeit nicht verfügbar.')));}
  }finally{busy=false}
}
function menu(){
  if(document.getElementById('officePersonalMemory'))return;
  const signout=document.getElementById('officeSignOut');
  if(!signout?.parentNode)return;
  const b=t('button','Was Romy über mich weiß','office-assistant-menu-action');
  b.id='officePersonalMemory';b.type='button';
  b.addEventListener('click',()=>{document.getElementById('closeDrawer')?.click();void openPanel()});
  signout.parentNode.insertBefore(b,signout);
}
sb.auth.onAuthStateChange?.((_event,session)=>{
  if(ownerId&&session?.user?.id!==ownerId){
    ++serial;ownerId=null;
    window.ISABELLA_APP?.closeModal?.();
  }
});
window.TBA_OFFICE_PERSONAL=Object.freeze({openPanel,setPresence,forget,ownerMemories,activeOwner});
menu();
})();
