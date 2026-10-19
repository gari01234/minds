/* Build 96C: project personnel are private records, never invited MINDS users. */
(()=>{
'use strict';
const sb=window.MINDS_SUPABASE;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function members(projectId){
  if(!projectId)return [];
  const {data:links,error}=await sb.from('minds_work_project_people')
    .select('person_id').eq('project_id',projectId);
  if(error)throw error;
  const ids=[...new Set((links||[]).map(x=>x.person_id).filter(Boolean))];
  if(!ids.length)return [];
  const {data,error:pe}=await sb.from('isabella_people')
    .select('id,name').in('id',ids);
  if(pe)throw pe;
  return (data||[]).sort((a,b)=>a.name.localeCompare(b.name,'de'));
}

async function open(project,onChanged=()=>{}){
  const [team,allResult]=await Promise.all([
    members(project.id),
    sb.from('isabella_people').select('id,name').order('name')
  ]);
  if(allResult.error)throw allResult.error;
  const all=allResult.data||[],linked=new Set(team.map(p=>p.id));
  const available=all.filter(p=>!linked.has(p.id));
  const peopleHtml=team.map(p=>
    '<div class="work-team-member"><strong>'+esc(p.name)+'</strong><span>'+
    '<button type="button" data-work-team-rename="'+esc(p.id)+'">Umbenennen</button>'+
    '<button type="button" data-work-team-remove="'+esc(p.id)+'">Entfernen</button>'+
    '</span></div>'
  ).join('')||'<p class="small">Noch niemand zugeordnet.</p>';
  const existingHtml='<label>Bereits erfasste Person<select id="workTeamExisting">'+
    '<option value="">Neue Person anlegen</option>'+
    available.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+
    '</select></label>';
  window.ISABELLA_APP?.openModal?.('Team · '+project.name,
    '<div class="form work-team-editor">'+
    '<p class="small">Nur zur internen Planung. Keine Einladung, kein MINDS-Zugang und keine Benachrichtigung für Teammitglieder.</p>'+
    '<div class="work-team-list">'+peopleHtml+'</div>'+
    existingHtml+
    '<label>Neue Person (Name)<input id="workTeamName" maxlength="120" autocomplete="off"></label>'+
    '<p id="workTeamError" class="small" role="status"></p>'+
    '<button id="workTeamAdd" class="primary" type="button">Zum Projekt hinzufügen</button>'+
    '</div>'
  );
  const error=msg=>{const el=$('#workTeamError');if(el)el.textContent=msg};
  const refresh=async()=>{await onChanged();await open(project,onChanged)};
  $('#workTeamAdd').onclick=async()=>{
    const button=$('#workTeamAdd');
    const existing=$('#workTeamExisting')?.value||'';
    const name=String($('#workTeamName')?.value||'').trim();
    if(!existing&&!name){error('Person auswählen oder Namen eingeben.');return}
    if(!existing&&all.some(p=>p.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'))){
      error('Diese Person existiert bereits. Bitte oben auswählen.');return;
    }
    button.disabled=true;
    let personId=existing;
    try{
      if(!personId){
        const {data,error:pe}=await sb.from('isabella_people')
          .insert({name,relationship:'colleague',metadata:{origin:'work_project_team_v1'}})
          .select('id').single();
        if(pe||!data?.id)throw pe||new Error('Person konnte nicht gespeichert werden.');
        personId=data.id;
      }
      const {error:me}=await sb.from('minds_work_project_people')
        .insert({project_id:project.id,person_id:personId});
      if(me)throw me;
      await refresh();
    }catch(e){
      error('Nicht gespeichert: '+(e?.message||e)+(personId&&!existing?
        ' Die Person wurde angelegt, aber nicht zugeordnet; bitte erneut aus der Liste auswählen.':''));
      button.disabled=false;
    }
  };
  $$('[data-work-team-remove]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.workTeamRemove,person=team.find(p=>p.id===id);
    if(!person||!window.confirm('„'+person.name+'“ aus diesem Projekt entfernen?'))return;
    b.disabled=true;
    const {error:re}=await sb.from('minds_work_project_people')
      .delete().eq('project_id',project.id).eq('person_id',id);
    if(re){error('Nicht entfernt. Prüfe, ob noch Aufgaben zugeordnet sind.');b.disabled=false;return}
    await refresh();
  });
  $$('[data-work-team-rename]').forEach(b=>b.onclick=async()=>{
    const person=team.find(p=>p.id===b.dataset.workTeamRename);
    if(!person)return;
    const name=window.prompt('Name',person.name)?.trim();
    if(!name||name===person.name)return;
    if(name.length>120){error('Name ist zu lang.');return}
    b.disabled=true;
    const {error:ue}=await sb.from('isabella_people')
      .update({name,updated_at:new Date().toISOString()}).eq('id',person.id);
    if(ue){error('Umbenennen fehlgeschlagen.');b.disabled=false;return}
    await refresh();
  });
}
window.MINDS_WORK_TEAM={members,open};
})();