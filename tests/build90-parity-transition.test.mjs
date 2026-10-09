import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('apps/isabella/app.js');
const work=read('apps/isabella/work.js');
const situation=read('apps/isabella/situation.js');
const portion=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Function boundary must remain present: '+start);
  return source.slice(a,b);
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('90.5 shared Markdown displays headings, bold and lists and never injects source HTML',()=>{
  const f=vm.runInNewContext('('+portion(app,'function formatMessageText(text){','function cleanGeneratedDeliverableText(').trim()+')',{esc});
  const html=f('## Estado actual\n- **HLS** pendiente\n- **TWP** abierto\n\n<script>alert(1)</script>');
  assert.match(html,/message-markdown-heading/);
  assert.match(html,/<strong>HLS<\/strong>/);
  assert.match(html,/<ul class="message-markdown-list">/);
  assert.ok(!html.includes('<script>'));
  assert.match(html,/&lt;script&gt;/);
  assert.ok(work.includes('ISABELLA_APP?.formatMessageText?.(copy)'),'Threads must use the exact same formatter as Chat');
});

test('90.4 Ahora resolves database UUID to client_key and edits the existing task',async()=>{
  const seen=[];
  const context={
    window:{
      MINDS_SUPABASE:{
        auth:{getSession:async()=>({data:{session:{user:{id:'owner-1'}}}})},
        from:table=>{
          assert.equal(table,'isabella_tasks');
          return {select:cols=>{assert.equal(cols,'id,client_key');return{
            eq(key,value){seen.push([key,value]);return this},
            async maybeSingle(){return {data:{id:'db-uuid',client_key:'task-client-key'},error:null}}
          }}}
        }
      },
      ISABELLA_SYNC_PULL_NOW:async()=>{seen.push(['pull',true])}
    },
    itemBy:(kind,id)=>{seen.push(['lookup',id]);return id==='task-client-key'&&seen.some(x=>x[0]==='pull')?{id}:null},
    editItem:(kind,id)=>seen.push(['edit',kind,id]),
    modal:(title)=>seen.push(['modal',title]),
    esc
  };
  const open=vm.runInNewContext('('+portion(app,'async function openCanonicalTaskById(rowId){','function itemActions(').trim()+')',context);
  await open('db-uuid');
  assert.deepEqual(seen.slice(-1)[0],['edit','task','task-client-key']);
  assert.deepEqual(seen.find(x=>x[0]==='id'),['id','db-uuid']);
  assert.deepEqual(seen.find(x=>x[0]==='user_id'),['user_id','owner-1']);
  assert.ok(!seen.some(x=>x[0]==='modal'),'A known canonical task must not silently fail');
  assert.ok(situation.includes('openCanonicalTaskById?.(button.dataset.situationTask)'));
});

test('90.4 unavailable canonical task yields a visible error rather than creating a shadow task',async()=>{
  const events=[];
  const ctx={window:{MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'owner-1'}}}})},from:()=>({select:()=>({eq(){return this},maybeSingle:async()=>({data:null,error:null})})})}},
    itemBy:()=>null,editItem:()=>events.push('edited'),modal:(title)=>events.push(title),esc};
  const open=vm.runInNewContext('('+portion(app,'async function openCanonicalTaskById(rowId){','function itemActions(').trim()+')',ctx);
  await open('missing');
  assert.deepEqual(events,['No pude abrir la tarea']);
});

test('90.5 Thread progress follows real send, persistence, response and error states',()=>{
  assert.match(work,/Mensaje guardado en MINDS/);
  assert.match(work,/Guardando la respuesta/);
  assert.match(work,/Respuesta recibida/);
  assert.match(work,/Comprueba el historial antes de reenviar/);
  assert.match(work,/threadInFlight\.has\(thread\.id\)/);
  assert.ok(!app.includes("if(name==='calendar'&&previous!=='calendar')state.date=today()"),'Lens navigation must preserve selected calendar date');
});

test('90.5 knowledge keeps document registration separate from accepted claims',()=>{
  assert.match(work,/Todavía no hay Claims registrados/);
  assert.match(work,/index_status==='indexed'/);
  assert.match(work,/Registrar un archivo no lo convierte automáticamente en conocimiento validado/);
});
