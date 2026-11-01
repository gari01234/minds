import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const work=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
// The cockpit's pure markup helpers plus renderOverview, up to the knowledge section.
const start=work.indexOf('// Panorama cockpit (pure markup)');
const end=work.indexOf('const knowledgeStates=',start);
assert.ok(start>=0&&end>start);

const today='2026-11-04';
const rows={
  isabella_tasks:[{id:'uuid',title:'Revisar Grundriss',due_date:'2026-11-06',assignee:'Antonia',work_status:'in_progress'},{id:'late',title:'Herr Fichtl anrufen',due_date:'2026-11-03'}],
  minds_work_memory:[
    {id:'b',memory_type:'document_state',title:'Projektsteckbrief',body:'Phase: LPH 3',status:'confirmed',metadata:{kind:'projektsteckbrief',felder:{phase:'LPH 3 Entwurfsplanung',meilensteine:[{datum:'2026-11-13',was:'Abgabe Entwurf'}],beteiligte:[{rolle:'TWP',name:'Josef Amler'}]},versionen:[{body:'x'}]},updated_at:'2026-11-04T03:00:00Z'},
    {id:'w',memory_type:'open_question',title:'Abgabetermin weicht ab',status:'proposed',metadata:{kind:'widerspruch'}},
    {id:'d',memory_type:'deadline',title:'Lichtkonzept an ELT',status:'proposed',occurred_at:'2026-11-12T12:00:00Z',metadata:{thema_id:'th1'}},
    {id:'a',memory_type:'commitment',title:'Pläne plotten',status:'proposed',metadata:{kind:'aufgabe',faellig:'2026-11-10'}},
    {id:'e',memory_type:'decision',title:'Lichtbänder statt Strahler',status:'confirmed',occurred_at:'2026-11-03T12:00:00Z',metadata:{}}],
  minds_work_threads:[{id:'th1',title:'Lichtplanung',summary:'',metadata:{themenblatt:{stand:'Schema steht.',offene_fragen:['a','b']}},updated_at:'2026-11-03T10:00:00Z'},{id:'th2',title:'Honorar',summary:'',metadata:{},updated_at:'2026-10-01'}],
  minds_work_files:[{id:'f1',name:'AW_ Abgabe.md',created_at:'2026-11-03',metadata:{art:'email',von:'Malterer'}}],
  minds_work_claims:[{id:'c1',claim_type:'deadline',status:'proposed'},{id:'c2',claim_type:'fact',status:'proposed'}],
  isabella_events:[], isabella_preferences:[{value:{projects:{bernried:{letzter_lauf:{status:'ok',am:'2026-11-04T02:23:00Z',zusammenfassung:'Encontré un plazo.'}}}}}]
};

test('Work Panorama (cockpit) renders the approved sections and binds every button',async()=>{
  const body={classList:{add(){}},innerHTML:''};
  const els={};const all=sel=>els[sel]||(els[sel]=[...body.innerHTML.matchAll(new RegExp(sel.replace(/[\[\]]/g,'').replace(/^data-/,'data-')+'="([^"]*)"','g'))].map(m=>({dataset:{},raw:m[1]})));
  const q=table=>{const b={select(){return b},eq(){return b},is(){return b},in(){return b},order(){return b},gte(){return b},lte(){return b},
    limit(){return Promise.resolve({data:rows[table]||[],count:table==='minds_work_files'?5:null,error:null})}};return b};
  const ctx={project:{id:'bernried',name:'Bernried'},view:'overview',activeThreadId:null,
    sb:{from:q,rpc:async()=>({data:{},error:null})},
    $:selector=>selector==='#workBody'?body:null,$$:selector=>all(selector),
    esc:x=>String(x??''),akteDate:iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:''},
    localIso:()=>today,claudeContinueUrl:t=>'https://claude.ai/new?q='+t.title,setStatus(){},
    window:{ISABELLA_APP:{openCanonicalTaskById:()=>{}}},document:{querySelector:()=>({click(){}})}};
  vm.createContext(ctx);vm.runInContext(work.slice(start,end),ctx);
  await vm.runInContext('renderOverview()',ctx);
  const html=body.innerHTML;
  assert.match(html,/aria-label="Panorama de Bernried"/);
  assert.match(html,/<h1>Bernried<\/h1><p>LPH 3 Entwurfsplanung<\/p>/);
  assert.match(html,/Próximo hito[\s\S]*Abgabe Entwurf/);
  assert.match(html,/Isabella, 04\.11\.2026:<\/b> Encontré un plazo\./);
  assert.match(html,/3 por confirmar · 1 vencida/);
  assert.match(html,/data-akte-decide="resolved">Geklärt/);
  assert.match(html,/data-akte-decide="confirmed">Bestätigen/);
  assert.match(html,/data-akte-task="a">Als Aufgabe anlegen/);
  assert.match(html,/data-cockpit-done="late">Hecho/);
  assert.match(html,/Revisar Grundriss<\/span><small>Antonia · En curso<\/small>/,'tasks in the next 14 days, with status');
  assert.match(html,/cockpit-chip is-frist">Frist<\/span><span class="cockpit-line-title"><b>Lichtkonzept an ELT<\/b>/);
  assert.match(html,/<em>TWP<\/em> Josef Amler/);assert.match(html,/data-akte-undo="b">Rückgängig/);
  assert.match(html,/Schema steht\.<\/p><small>2 offene Fragen · 1 Frist<\/small>/);
  assert.match(html,/Todavía sin Themenblatt[\s\S]*Empezar en Claude/);
  assert.match(html,/Lichtbänder statt Strahler/);
  assert.match(html,/2 afirmaciones esperan revisión; 1 parece un plazo\./);
  for(const go of ['planner','threads','desktop','knowledge'])assert.ok(html.includes('data-work-go="'+go+'"'),go);
  assert.ok(!html.includes('Claims en revisión')&&!html.includes('Lectura de Isabella'),'model reading moved to Conocimiento');
  for(const sel of ['[data-work-go]','[data-work-edit-task]','[data-akte-decide]','[data-akte-task]','[data-akte-undo]','[data-cockpit-done]','[data-cockpit-thread]','[data-cockpit-file]'])
    assert.ok(els[sel]?.length&&els[sel].every(x=>typeof x.onclick==='function'),sel);
});

test('Panorama stays read-only: writes live in helpers outside renderOverview',()=>{
  const ov=work.slice(work.indexOf('async function renderOverview(){'),work.indexOf('const knowledgeStates='));
  assert.ok(!ov.includes('.insert(')&&!ov.includes('.update(')&&!ov.includes('.delete('));
});
