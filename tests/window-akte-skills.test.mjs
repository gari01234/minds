// Projektakte phase 2: shared skill library, nightly Akte-Pflege, Akte notices, work-style proposals,
// versioned Steckbrief, proposed tasks/contradictions in Panorama, Desktop duplicates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import LIB,{AKTE_SKILLS,akteSkillMessage,akteSkillRows} from '../supabase/functions/_shared/akte-skills.mjs';
import {createWindowTools} from '../supabase/functions/_shared/window-tools.mjs';
import {createAkteTools} from '../supabase/functions/_shared/window-akte.mjs';
import {runAktePflege,collectNew,applyResult,trustedPflegeWorkflow,PFLEGE_SCHEMA,PFLEGE_STATE_KEY} from '../supabase/functions/_shared/akte-pflege.mjs';
import {akteAttentionCandidates,runAkteAttention,akteRoutes,inDaytime} from '../supabase/functions/_shared/akte-attention.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const require=createRequire(import.meta.url);

// PostgREST-like mock: filters incl. JSON paths, gt/like, insert/update/upsert/delete, rpc log.
function mockSb(fx,{rpc}={}){
  const db=JSON.parse(JSON.stringify(fx)),log=[];let seq=0;
  const val=(r,c)=>c.includes('->>')?((r[c.split('->>')[0]]||{})[c.split('->>')[1]]??null):r[c];
  const from=table=>{
    const f=[];let op='select',payload=null,single=false,maybe=false,limitN=null,sort=null,conflict=null;
    const b={select(){return b},range(){return b},order(c,o){sort={c,asc:o?.ascending!==false};return b},
      eq(c,v){f.push(r=>String(val(r,c))===String(v));return b},is(c,v){f.push(r=>(val(r,c)??null)===v);return b},
      in(c,vs){f.push(r=>vs.map(String).includes(String(val(r,c))));return b},
      gt(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))>String(v));return b},gte(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))>=String(v));return b},
      lte(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))<=String(v));return b},lt(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))<String(v));return b},
      like(c,p){const pre=p.replace(/%$/,'');f.push(r=>String(val(r,c)||'').startsWith(pre));return b},
      limit(n){limitN=n;return b},insert(rows){op='insert';payload=rows;return b},update(p){op='update';payload=p;return b},
      upsert(row,o){op='upsert';payload=row;conflict=o?.onConflict;return b},delete(){op='delete';return b},
      single(){single=true;return b.then(x=>x)},maybeSingle(){maybe=true;return b.then(x=>x)},
      then(res,rej){db[table]=db[table]||[];let out;
        if(op==='insert'){out=(Array.isArray(payload)?payload:[payload]).map(r=>({id:r.id||(table+'-'+(++seq)),created_at:r.created_at||'2026-11-04T03:00:00Z',updated_at:'2026-11-04T03:00:00Z',...r}));db[table].push(...out);log.push({table,op,rows:out})}
        else if(op==='upsert'){const keys=String(conflict||'id').split(',');const hit=db[table].find(r=>keys.every(k=>String(r[k])===String(payload[k])));if(hit)Object.assign(hit,payload);else db[table].push({...payload});out=[payload];log.push({table,op,row:payload})}
        else if(op==='update'){out=db[table].filter(r=>f.every(fn=>fn(r)));out.forEach(r=>Object.assign(r,payload));log.push({table,op,patch:payload,count:out.length})}
        else if(op==='delete'){out=db[table].filter(r=>f.every(fn=>fn(r)));db[table]=db[table].filter(r=>!out.includes(r));log.push({table,op,count:out.length})}
        else{out=db[table].filter(r=>f.every(fn=>fn(r)));if(sort)out=[...out].sort((a,b)=>(String(a[sort.c]??'')<String(b[sort.c]??'')?-1:String(a[sort.c]??'')>String(b[sort.c]??'')?1:0)*(sort.asc?1:-1));if(limitN!=null)out=out.slice(0,limitN)}
        return Promise.resolve({data:single||maybe?(out[0]||null):out,error:single&&!out[0]?{message:'no rows'}:null}).then(res,rej)}};
    return b;};
  return {from,log,db,rpc:async(name,args)=>{log.push({rpc:name,args});if(rpc)return rpc(name,args,db);
    if(name==='minds_ensure_work_thread_conversation'){const t=db.minds_work_threads.find(x=>x.id===args.p_thread_id);t.conversation_id='conv-'+t.id;return {data:t.conversation_id,error:null}}
    return {data:{status:'proposed'},error:null}}};
}
const U='owner-1',NOW=new Date('2026-11-04T02:30:00Z');
const fixture=()=>({
  isabella_projects:[{id:'p-b',client_key:'bernried',name:'Bernried',user_id:U},{id:'p-w',client_key:'window',name:'Window',user_id:U},{id:'p-s',client_key:'schwarz',name:'Schwarz',user_id:U}],
  minds_self_review_settings:[{project_id:'p-w'}],
  minds_work_threads:[{id:'th-licht',title:'Lichtplanung',summary:'',status:'active',project_id:'p-b',conversation_id:'conv-licht',metadata:{},user_id:U,updated_at:'2026-11-01'}],
  minds_work_memory:[
    {id:'mem-old',project_id:'p-b',user_id:U,memory_type:'deadline',title:'Lichtkonzept an ELT',status:'rejected',created_at:'2026-10-01T00:00:00Z',metadata:{}},
    {id:'brief',project_id:'p-b',user_id:U,memory_type:'document_state',title:'Projektsteckbrief',body:'Phase: LPH 3',status:'confirmed',metadata:{kind:'projektsteckbrief',felder:{phase:'LPH 3'},aktualisiert_von:'Claude'},updated_at:'2026-11-01T00:00:00Z'}],
  minds_work_files:[
    {id:'x-new',name:'AW_ Abgabe Entwurf.eml.md',source_kind:'email',index_status:'indexed',project_id:'p-b',user_id:U,created_at:'2026-11-03T10:00:00Z',updated_at:'2026-11-03T10:05:00Z',metadata:{art:'email',von:'Malterer',datum:'2026-11-03',betreff:'Abgabe'}},
    {id:'x-old',name:'Alt.pdf',source_kind:'document',index_status:'indexed',project_id:'p-b',user_id:U,created_at:'2026-09-01',updated_at:'2026-09-01T00:00:00Z',metadata:{}}],
  minds_work_source_segments:[{file_id:'x-new',user_id:U,segment_no:0,source_version:'v1',content:'Bitte den Entwurf bis spätestens 13.11.2026 abgeben.',created_at:'2026-11-03T10:05:00Z'}],
  conversation_messages:[{conversation_id:'conv-licht',user_id:U,role:'assistant',content:'**Sitzungsübergabe** · Lichtbänder entschieden',created_at:'2026-11-03T15:00:00Z',metadata:{source:'claude_connector'}}],
  isabella_tasks:[{id:'t1',title:'Herr Fichtl anrufen',due_date:'2026-11-05',completed_at:null,archived_at:null,project_id:'p-b',user_id:U}],
  isabella_preferences:[]
});
const result=over=>({zusammenfassung:'Encontré el plazo de entrega del Entwurf.',
  steckbrief:{aendern:true,phase:'LPH 3 Entwurfsplanung',notizen:'',grund:'Abgabe genannt',meilensteine:[{datum:'2026-11-13',was:'Abgabe Entwurf'}],beteiligte:[],prioritaeten:[]},
  fristen:[{titel:'Abgabe Entwurf',datum:'2026-11-13',quelle:'AW_ Abgabe Entwurf.eml.md',thema:''},{titel:'Ohne Datum',datum:'bald',quelle:'',thema:''},{titel:'Lichtkonzept an ELT',datum:'2026-11-20',quelle:'x',thema:''}],
  entscheidungen:[{titel:'Lichtbänder im Ausstellungsraum',datum:'2026-11-03',quelle:'Sitzungsübergabe',thema:'Lichtplanung'}],
  aufgaben:[{titel:'Entwurfspläne plotten',faellig:'2026-11-12',quelle:'AW_ Abgabe Entwurf.eml.md',thema:''}],
  widersprueche:[{titel:'Abgabetermin weicht vom Protokoll ab',details:'E-Mail 13.11., Protokoll 20.11.',quellen:'AW_ Abgabe; Protokoll 05.10.'}],...over});

test('Skill library: one source, byte-identical browser copy, nine German skills incl. the original prompts',()=>{
  const block=s=>s.slice(s.indexOf('/* akte-skills:begin */'),s.indexOf('/* akte-skills:end */'));
  assert.equal(block(read('apps/isabella/akte-skills.js')),block(read('supabase/functions/_shared/akte-skills.mjs')));
  const browser=require('../apps/isabella/akte-skills.js');
  assert.equal(browser.AKTE_SKILLS.length,9);
  const prompts=AKTE_SKILLS.map(s=>s.prompt);
  for(const p of ['thema_fortsetzen','sitzung_abschliessen','emails_ablegen','jour_fixe_vorbereiten','protokoll_erstellen','schriftverkehr','entscheidung_dokumentieren','fristen_pruefen','themenblatt_pflegen'])assert.ok(prompts.includes(p),p);
  assert.equal(new Set(AKTE_SKILLS.map(s=>s.slug)).size,9);
  const rows=akteSkillRows();
  assert.ok(rows.every(r=>r.slug.startsWith('akte-')&&r.agent==='isabella'&&r.metadata.pack==='projektakte_de'&&r.instructions.length>100));
  // Letters never invent legal grounds.
  assert.match(AKTE_SKILLS.find(s=>s.slug==='schriftverkehr').instructions,/nur nennen, wenn[\s\S]*\[prüfen\][\s\S]*Keine Rechtsberatung/);
  const msg=akteSkillMessage(AKTE_SKILLS.find(s=>s.slug==='fristen-pruefen'),{projekt:'Bernried'});
  assert.match(msg,/^Revisa los plazos del proyecto Bernried\.\n\nArbeitsanweisung «Fristen prüfen»:\nZiel:/);
  const edited=akteSkillMessage(AKTE_SKILLS[0],{projekt:'Bernried',thema:'Licht'},{instructions:'Meine Version.',version:3});
  assert.match(edited,/v3 \(Window\):\nMeine Version\.$/);
  assert.equal(LIB.AKTE_SKILL_PREFIX,'akte-');
});

test('Connector: prompts come from the library and prefer Gari\'s edited copy; close_session accepts arbeitsweise',async()=>{
  const fn=read('supabase/functions/window-mcp/index.ts');
  assert.match(fn,/import \{AKTE_SKILLS,AKTE_SKILL_PREFIX,akteSkillMessage\} from "\.\.\/_shared\/akte-skills\.mjs";/);
  assert.match(fn,/akte\.personalSkill\(AKTE_SKILL_PREFIX\+skill\.slug\)/);
  assert.match(fn,/arbeitsweise:z\.array\(/);
  assert.match(fn,/Never infer personality or anything sensitive/);
  const sb=mockSb({...fixture(),minds_user_skills:[{user_id:U,agent:'isabella',slug:'akte-fristen-pruefen',instructions:'X',version:2,enabled:true},{user_id:U,agent:'isabella',slug:'akte-protokoll-erstellen',instructions:'Y',version:1,enabled:false}]});
  const akte=createAkteTools({sb,userId:U,base:createWindowTools({sb,userId:U,now:()=>NOW}),now:()=>NOW});
  assert.equal((await akte.personalSkill('akte-fristen-pruefen')).instructions,'X');
  assert.equal(await akte.personalSkill('akte-protokoll-erstellen'),null,'a paused skill falls back to the library');
});

test('close_session turns Gari\'s explicit work-style statements into operating-model proposals',async()=>{
  const sb=mockSb(fixture());
  const akte=createAkteTools({sb,userId:U,base:createWindowTools({sb,userId:U,now:()=>NOW}),now:()=>NOW,uuid:()=>'u'+Math.random()});
  const r=await akte.closeSession({project:'Bernried',topic:'Lichtplanung',stand:'Lichtbänder entschieden.',
    arbeitsweise:[{aussage:'Prefiere ver primero un borrador corto antes del texto completo.',bereich:'communication',zitat:'mándame primero algo corto'},{aussage:'',bereich:'review'},{aussage:'Agrupa las preguntas al final.',bereich:'nope'}]});
  const calls=sb.log.filter(x=>x.rpc==='minds_propose_operating_model_hypothesis');
  assert.equal(calls.length,2);
  assert.equal(calls[0].args.p_dimension,'communication');assert.equal(calls[0].args.p_source_kind,'conversation');
  assert.equal(calls[0].args.p_source_ref,'claude:topic:th-licht');assert.equal(calls[0].args.p_evidence_note,'mándame primero algo corto');
  assert.equal(calls[1].args.p_dimension,'communication','unknown areas fall back to communication');
  assert.equal(r.arbeitsweise.length,2);assert.match(r.hinweis,/Lo que Isabella sabe de mí/);
});

test('Steckbrief updates are versioned (undoable) and unchanged text is not rewritten',async()=>{
  const sb=mockSb(fixture());
  const akte=createAkteTools({sb,userId:U,base:createWindowTools({sb,userId:U,now:()=>NOW}),now:()=>NOW,actor:'isabella'});
  const same=await akte.updateProjectBrief({project:'Bernried',phase:'LPH 3'});
  assert.equal(same.unveraendert,true);
  await akte.updateProjectBrief({project:'Bernried',phase:'LPH 3 Entwurfsplanung'});
  const brief=sb.db.minds_work_memory.find(m=>m.id==='brief');
  assert.equal(brief.body,'Phase: LPH 3 Entwurfsplanung');
  assert.equal(brief.metadata.aktualisiert_von,'Isabella');
  assert.deepEqual(brief.metadata.versionen[0],{body:'Phase: LPH 3',felder:{phase:'LPH 3'},aktualisiert_am:'2026-11-01T00:00:00Z',aktualisiert_von:'Claude'});
});

test('Akte-Pflege: only new material, Window skipped, nothing-new costs nothing, proposals vs direct updates',async()=>{
  const sb=mockSb(fixture());const calls=[];
  const callModel=async input=>{calls.push(input);return {value:result(),payload:{model:'gpt-5.6-luna',usage:{input_tokens:9000,output_tokens:600,total_tokens:9600}}}};
  const r=await runAktePflege({sb,callModel,now:NOW});
  assert.equal(calls.length,1,'only Bernried had something new');
  const input=calls[0];
  assert.equal(input.projekt,'Bernried');
  assert.deepEqual(input.neu_seit_letzter_pflege.dokumente.map(d=>d.datei),['AW_ Abgabe Entwurf.eml.md'],'old files are not re-read');
  assert.equal(input.neu_seit_letzter_pflege.nachrichten[0].von,'Claude');
  assert.ok(input.aktueller_stand.register.some(e=>e.titel==='Lichtkonzept an ELT'&&e.status==='verworfen'),'discarded entries are visible so they are not re-proposed');
  const mem=sb.db.minds_work_memory;
  const frist=mem.find(m=>m.title==='Abgabe Entwurf');
  assert.equal(frist.status,'proposed');assert.equal(frist.memory_type,'deadline');assert.equal(frist.metadata.source,'isabella_akte_pflege');
  assert.ok(!mem.some(m=>m.title==='Ohne Datum'),'a Frist needs a concrete date');
  assert.equal(mem.filter(m=>m.title==='Lichtkonzept an ELT').length,1,'a discarded Frist is not proposed again');
  assert.equal(mem.find(m=>m.title==='Lichtbänder im Ausstellungsraum').metadata.thema,'Lichtplanung');
  const task=mem.find(m=>m.memory_type==='commitment');assert.equal(task.metadata.kind,'aufgabe');assert.equal(task.metadata.faellig,'2026-11-12');assert.equal(task.status,'proposed');
  assert.equal(mem.find(m=>m.memory_type==='open_question').metadata.kind,'widerspruch');
  assert.match(mem.find(m=>m.id==='brief').body,/Abgabe Entwurf/,'the Steckbrief is updated directly');
  assert.ok(!sb.db.isabella_tasks.some(t=>t.title==='Entwurfspläne plotten'),'no real task without Gari');
  const usage=sb.db.minds_ai_usage[0];assert.equal(usage.feature,'akte_pflege');assert.equal(usage.input_tokens,9000);
  const state=sb.db.isabella_preferences.find(p=>p.preference_key===PFLEGE_STATE_KEY).value;
  assert.equal(state.projects['p-b'].letzter_lauf.fristen,1);assert.equal(state.projects['p-s'].letzter_lauf.status,'nichts_neu');
  assert.ok(!state.projects['p-w'],'the Window project has no Akte');
  assert.equal(r.model_runs,1);assert.equal(r.ok,true);
  // Second night with nothing new: no model call at all.
  const again=await runAktePflege({sb,callModel,now:new Date('2026-11-05T02:30:00Z')});
  assert.equal(calls.length,1);assert.equal(again.model_runs,0);
});

test('Akte-Pflege keeps the material for the next night when the model fails',async()=>{
  const sb=mockSb(fixture());
  const r=await runAktePflege({sb,now:NOW,callModel:async()=>{const e=new Error('model_failed:429');e.payload={usage:{input_tokens:10,output_tokens:0}};throw e}});
  assert.equal(r.ok,false);
  const st=sb.db.isabella_preferences[0].value.projects['p-b'];
  assert.equal(st.letzter_lauf.status,'fehler');assert.equal(st.last_run,undefined,'last_run is not advanced');
});

test('Akte-Pflege only trusts its own workflow on main; schema is strict',()=>{
  const ok={repository:'gari01234/minds',repository_id:'1387794687',ref:'refs/heads/main',workflow_ref:'gari01234/minds/.github/workflows/akte-pflege.yml@refs/heads/main',event_name:'schedule',run_id:'123'};
  assert.equal(trustedPflegeWorkflow(ok),true);
  assert.equal(trustedPflegeWorkflow({...ok,ref:'refs/heads/feature'}),false);
  assert.equal(trustedPflegeWorkflow({...ok,workflow_ref:'gari01234/minds/.github/workflows/window-code.yml@refs/heads/main'}),false);
  assert.equal(trustedPflegeWorkflow({...ok,event_name:'pull_request'}),false);
  const walk=o=>{if(o&&o.type==='object'){assert.equal(o.additionalProperties,false);assert.deepEqual([...o.required].sort(),Object.keys(o.properties).sort());Object.values(o.properties).forEach(walk)}if(o&&o.type==='array')walk(o.items)};
  walk(PFLEGE_SCHEMA);
  const wf=read('.github/workflows/akte-pflege.yml');
  assert.match(wf,/cron: '23 1 \* \* \*'/);assert.match(wf,/id-token: write/);assert.match(wf,/audience=minds-akte-pflege/);
  assert.match(wf,/functions\/v1\/window-akte-pflege/);
  const fn=read('supabase/functions/window-akte-pflege/index.ts');
  assert.match(fn,/audience:PFLEGE_AUDIENCE/);assert.match(fn,/trustedPflegeWorkflow\(payload\)/);
  assert.match(read('supabase/config.toml'),/\[functions\.window-akte-pflege\]\nverify_jwt = false/);
  assert.match(read('.github/workflows/verify.yml'),/supabase\/functions\/window-akte-pflege\/index\.ts/);
});

test('Akte notices: daytime only, routes follow Proactividad, one card per batch of pending entries',()=>{
  const noon=new Date('2026-11-04T11:00:00Z'),night=new Date('2026-11-04T02:00:00Z');
  assert.equal(inDaytime(noon,'Europe/Berlin'),true);assert.equal(inDaytime(night,'Europe/Berlin'),false);
  assert.deepEqual(akteRoutes({}),{akteFristen:'ambient',akteOffen:'ambient'});
  const deadlines=[{id:'d1',project_id:'p-b',title:'Abgabe Entwurf',status:'confirmed',occurred_at:'2026-11-05T12:00:00Z'},
    {id:'d2',project_id:'p-b',title:'Später',status:'proposed',occurred_at:'2026-11-12T12:00:00Z'}];
  const pending=[{id:'a',project_id:'p-b',title:'Lichtbänder',created_at:'2026-11-04T03:00:00Z'},{id:'b',project_id:'p-b',title:'Abgabe',created_at:'2026-11-03T03:00:00Z'}];
  const c=akteAttentionCandidates({deadlines,pending,projects:[{id:'p-b',name:'Bernried'}],attention:{},now:noon});
  assert.equal(c.length,2);
  const f=c.find(x=>x.metadata.akte_kind==='frist');
  assert.equal(f.event_type,'expectation_due');assert.equal(f.title,'Plazo mañana (05.11.): Abgabe Entwurf');assert.equal(f.urgency,'attention');
  assert.equal(f.event_key,'akte:frist:d1:2026-11-05');
  const o=c.find(x=>x.metadata.akte_kind==='offen');
  assert.equal(o.title,'2 entradas por confirmar en Bernried');assert.equal(o.event_key,'akte:offen:p-b:2026-11-04');
  const fewer=akteAttentionCandidates({deadlines:[],pending:[pending[0]],projects:[],attention:{},now:noon});
  assert.equal(fewer[0].event_key,o.event_key,'confirming older entries does not create a new card');
  const loud=akteAttentionCandidates({deadlines,pending,projects:[],attention:{akteFristen:'interrupt',akteOffen:'briefing'},now:noon});
  assert.equal(loud[0].user_requested,true);assert.equal(loud[0].event_type,'upcoming_event');
  assert.equal(loud[1].event_type,'review_required');
  assert.equal(akteAttentionCandidates({deadlines,pending,projects:[],attention:{akteFristen:'silent',akteOffen:'silent'},now:noon}).length,0);
});

test('Heartbeat publishes Akte notices by day, resolves stale ones, and never runs them at night',async()=>{
  const fx={isabella_preferences:[{user_id:U,preference_key:'assistant',value:{attention:{akteOffen:'silent'}}}],
    minds_work_memory:[{id:'d1',user_id:U,project_id:'p-b',memory_type:'deadline',title:'Abgabe Entwurf',status:'confirmed',occurred_at:'2026-11-05T12:00:00Z',created_at:'2026-11-01T00:00:00Z',metadata:{}}],
    isabella_projects:[{id:'p-b',user_id:U,name:'Bernried'}],
    minds_attention_events:[{id:'e-old',user_id:U,event_key:'akte:frist:gone:2026-11-04',status:'delivered',surface_item_id:'s1'},{id:'e-other',user_id:U,event_key:'heartbeat:x',status:'pending'}],
    minds_surface_items:[{id:'s1',user_id:U,status:'active'}]};
  const sb=mockSb(fx,{rpc:async()=>({data:{status:'pending',duplicate:false},error:null})});
  const r=await runAkteAttention(sb,U,{now:new Date('2026-11-04T11:00:00Z')});
  assert.equal(r.status,'ok');assert.equal(r.published,1);assert.equal(r.resolved,1);
  assert.equal(sb.log.find(x=>x.rpc==='minds_publish_attention').args.p_candidate.event_key,'akte:frist:d1:2026-11-05');
  assert.equal(sb.db.minds_attention_events.find(e=>e.id==='e-old').status,'resolved');
  assert.equal(sb.db.minds_attention_events.find(e=>e.id==='e-other').status,'pending','other notices are untouched');
  assert.equal(sb.db.minds_surface_items[0].status,'dismissed');
  const nightSb=mockSb(fx);const n=await runAkteAttention(nightSb,U,{now:new Date('2026-11-04T01:00:00Z')});
  assert.equal(n.status,'night');assert.ok(!nightSb.log.some(x=>x.rpc));
  const hb=read('supabase/functions/isabella-heartbeat/index.ts');
  assert.match(hb,/const akteAttention=await runAkteAttention\(sb,userId,\{now,tz:routineTz\}\);/);
  assert.match(hb,/akte_attention:akteAttention/);
});

test('Window UI: Proactividad choices, skills pack install, Panorama actions, undo, duplicates, scroll',()=>{
  const app=read('apps/isabella/app.js'),work=read('apps/isabella/work.js'),css=read('apps/isabella/minds-calendar-shell.css');
  assert.match(app,/akteFristen:route\(p\.akteFristen,'ambient'\)/);
  assert.match(app,/id="attentionAkteFristen"/);assert.match(app,/akteOffen:\$\('#attentionAkteOffen'\)\.value/);
  assert.match(app,/from\('minds_user_skills'\)\.insert\(missing\)/);
  assert.match(read('apps/isabella/index.html'),/<script src="\.\/akte-skills\.js\?v=1"><\/script>/);
  assert.match(read('apps/isabella/sw.js'),/'\.\/akte-skills\.js\?v=1',/);
  assert.match(work,/data-akte-task="'\+esc\(r\.id\)\+'">Als Aufgabe anlegen/);
  assert.match(work,/data-akte-decide="resolved">Geklärt/);
  assert.match(work,/data-akte-undo=/);
  assert.match(work,/sb\.from\('isabella_preferences'\)\.select\('value'\)\.eq\('preference_key','akte_pflege'\)\.limit\(1\)/);
  assert.match(work,/if\(!button\.dataset\.confirm\)/,'deleting duplicates needs a second tap');
  assert.match(work,/classList\.toggle\('work-scroll-host',view!=='planner'\)/);
  assert.match(css,/#workBody\.work-scroll-host\{overflow-y:auto!important/);
  // Panorama helpers stay outside the overview render function (it must not write).
  const ov=work.slice(work.indexOf('async function renderOverview(){'),work.indexOf('const knowledgeStates='));
  assert.ok(!ov.includes('.update(')&&!ov.includes('.insert('));
});

test('Desktop duplicates: same hash, or same name ignoring copy suffixes and same size; the oldest stays',()=>{
  const work=read('apps/isabella/work.js');
  const src=work.slice(work.indexOf('function duplicateKey(f){'),work.indexOf('async function loadDuplicateGroups(){'));
  const ctx={};vm.runInNewContext(src+';this.duplicateGroups=duplicateGroups;',ctx);
  const g=ctx.duplicateGroups([
    {id:'1',name:'AW_ Termin.pdf',size_bytes:1000,created_at:'2026-10-02'},
    {id:'2',name:'AW_ Termin (1).pdf',size_bytes:1000,created_at:'2026-10-03'},
    {id:'0',name:'aw_ termin - Kopie.pdf',size_bytes:1000,created_at:'2026-10-01'},
    {id:'3',name:'AW_ Termin.pdf',size_bytes:2000,created_at:'2026-10-04'},
    {id:'4',name:'Notiz A.md',size_bytes:10,metadata:{content_sha256:'abc'},created_at:'2026-10-05'},
    {id:'5',name:'Notiz B.md',size_bytes:12,metadata:{content_sha256:'abc'},created_at:'2026-10-06'}]);
  assert.equal(g.length,2);
  assert.equal(JSON.stringify(g.map(x=>x.map(f=>f.id))),JSON.stringify([['0','1','2'],['4','5']]));
});
