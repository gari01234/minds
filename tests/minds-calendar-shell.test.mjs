import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('apps/isabella/minds-calendar-shell.css');
const index=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const app=read('apps/isabella/app.js');
const ai=read('apps/isabella/ai.js');
const shell=read('apps/isabella/shell.js');
const work=read('apps/isabella/work.js');
const dashboard=read('apps/isabella/dashboard.js');
const model=require('../apps/isabella/dashboard-model.js');

test('Calendar/shell layer is the last stylesheet and is precached',()=>{
  assert.match(index,/minds-sections-parity\.css\?v=1">\s*<link rel="stylesheet" href="\.\/minds-calendar-shell\.css\?v=1">\s*<\/head>/);
  assert.match(sw,/minds-sections-parity\.css\?v=1',\s*'\.\/minds-calendar-shell\.css\?v=1'/);
  assert.doesNotMatch(css,/@import|@font-face|url\(/);
});

test('Week is a proportional time grid that keeps task drag targets',()=>{
  const week=app.slice(app.indexOf('function week(){'),app.indexOf('function day(){'));
  assert.match(week,/class="week week-timegrid"/);
  assert.match(week,/window\.MINDS_DAY_LAYOUT\?\.layout\(x\.timed\)/);
  assert.match(week,/top:\$\{top\.toFixed\(1\)\}px;height:\$\{height\.toFixed\(1\)\}px/);
  assert.match(week,/<div class="wday" data-week-date="\$\{x\.di\}">/);
  assert.match(week,/class="calendar-entry task-item wk-chip/);
  assert.match(week,/class="calendar-entry event-item wk-event/);
  assert.match(css,/\.week-timegrid \.wk-event\{[^}]*position:absolute;/);
  assert.match(css,/calc\(var\(--wk-hours\) \* var\(--wk-hour\)\)/);
});

test('Multi-day tasks belong to every day of their window, never to a done day',()=>{
  const s={tasks:[
    {id:'own',date:'2026-11-02',sortOrder:5},
    {id:'span',startDate:'2026-10-28',date:'2026-11-05'},
    {id:'done',startDate:'2026-10-28',date:'2026-11-05',done:true},
    {id:'archived',startDate:'2026-10-28',date:'2026-11-05',archivedAt:'2026-10-30'}
  ]};
  assert.deepEqual(model.tasksForDay(s,'2026-11-02').map(x=>x.id),['own','span']);
  assert.deepEqual(model.tasksForDay(s,'2026-11-05').map(x=>x.id),['span','done']);
  assert.deepEqual(model.tasksForDay(s,'2026-10-27').map(x=>x.id),[]);
  assert.equal(model.spansDay(s.tasks[1],'2026-11-05'),false,'the due day is the task own day');
  assert.match(dashboard,/:scope > \.desk-task-row:not\(\.is-done\):not\(\.is-span\)/);
  assert.match(dashboard,/' · en curso hasta '/);
  assert.match(app,/spans\.map\(t=>'<button class="pill calendar-entry is-span" data-kind="task"/);
  assert.ok(!/pill calendar-entry is-span[^']*data-date/.test(app),'span pills cannot be dropped into a day');
  assert.match(ai,/in_progress:true,start_date:x\.startDate,due_date:x\.date/);
});

test('Ahora lists tasks already running today',async()=>{
  const source=read('apps/isabella/situation.js');
  const node={innerHTML:'',querySelector(){return {addEventListener(){}}}};
  const today=new Date(),pad=n=>String(n).padStart(2,'0');
  const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const before=new Date(today.getTime()-2*864e5),after=new Date(today.getTime()+3*864e5);
  // Like PostgREST: the due-date query only returns tasks due by today; the start-date query returns the span.
  const q=name=>{const o={},filters=[];for(const m of ['select','eq','is','not','in','order','limit'])o[m]=()=>o;
    o.lte=(column)=>{filters.push(column);return o};
    o.then=(res,rej)=>Promise.resolve(name==='isabella_tasks'&&filters.includes('start_date')?{data:[{id:'span',title:'Treppen',start_date:key(before),due_date:key(after)}],count:1,error:null}:{data:[],count:0,error:null}).then(res,rej);return o};
  const window={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:q},ISABELLA_STATE:{projects:[]}};
  vm.runInNewContext(source,{window,document:{querySelector:s=>s==='#situationLedger'?node:null},Promise,Date,console});
  await window.MINDS_SITUATION.render();
  assert.match(node.innerHTML,/Treppen[\s\S]*?En curso · hasta/);
});

test('Idea replies that arrived as JSON text are shown as prose plus a formatted draft',()=>{
  const parts=new Function(app.slice(app.indexOf('function ideaWorkerParts('),app.indexOf('function renderIdeaWorkspace('))+';return ideaWorkerParts;')();
  const full=JSON.stringify({reply:'He avanzado.',artifact:{title:'Contrato',format:'markdown',content:'# Uno\n\n- a\n- b'}});
  assert.deepEqual(parts(full),{reply:'He avanzado.',artifact:{title:'Contrato',content:'# Uno\n\n- a\n- b'},complete:true});
  const cut=parts(full.slice(0,full.length-12));
  assert.equal(cut.reply,'He avanzado.');assert.equal(cut.complete,false);assert.match(cut.artifact.content,/^# Uno/);
  assert.equal(parts('Respuesta normal'),null);
  assert.match(app,/formatMessageText\(parts\?parts\.reply:\(m\.content\|\|''\)\)/);
  assert.match(app,/<div class="idea-markdown-render">\$\{formatMessageText\(content\)\}<\/div>/);
  assert.match(ai,/if\(parts&&parts\.complete\)/);
});

test('Every send button is the blue Chat send with the vector arrow and a calm working state',()=>{
  assert.ok(!shell.includes('<button class="send" aria-label="Enviar">↑</button>'));
  assert.ok(!work.includes('<button class="send" aria-label="Enviar">↑</button>'));
  assert.equal((shell.match(/class="send"[^>]*><svg class="chat-ui-icon"/g)||[]).length,3);
  assert.match(css,/:is\(\.idea-workspace-form,\.feed-thread-form,\.work-thread-composer\) \.send\{[^}]*background:#007aff!important;/);
  assert.match(css,/\.send\.is-working::before,\.surface-refresh\.is-working::before\{[^}]*-webkit-mask:none;mask:none;[^}]*animation:minds-send-spin/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('Desktop shell: no top bar or orb; the More menu sits under Thoughts',()=>{
  assert.match(shell,/<strong>Thoughts<\/strong><small>Dear: Thoughts<\/small><\/span><\/button>\s*<div class="minds-menu-slot lens-menu-slot" data-menu-slot="sidebar"><\/div>/);
  assert.match(app,/const host=desk\?document\.querySelector\('\[data-menu-slot="sidebar"\]'\)/);
  assert.match(app,/matchMedia\?\.\('\(min-width: 950px\)'\)\?\.addEventListener\?\.\('change',\(\)=>placeGlobalMenu\(state\.screen\)\)/);
  assert.match(css,/body\.desk-enabled \.app\{grid-template-rows:0 minmax\(0,1fr\)!important\}/);
  assert.match(css,/body\.desk-enabled \.topbar\{display:none!important\}/);
  assert.match(css,/body\.desk-enabled \.orb-dock\{display:none!important\}/);
  assert.equal((shell.match(/id="menuButton"/g)||[]).length,1);
});

test('Server agenda and briefing include multi-day tasks (needs function deploy)',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const routine=read('supabase/functions/isabella-routine-runner/index.ts');
  assert.match(chat,/const runsOn=\(x:any,day:string\)=>!!x\.start_date&&!!x\.date&&x\.start_date<=day&&day<x\.date;/);
  assert.match(chat,/in_progress:true,due_date:x\.date/);
  assert.match(chat,/tq\.or\(`due_date\.lte\.\$\{to\},start_date\.lte\.\$\{to\}`\)/);
  assert.match(routine,/select\("title,due_date,start_date,completed_at/);
  assert.match(routine,/in_progress_today:true/);
});
