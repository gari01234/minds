import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWindowTools,ToolError,localDay,addDays} from '../supabase/functions/_shared/window-tools.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

// Minimal PostgREST-like mock: applies eq/is/in/gte/lt/lte/ilike filters to fixture rows.
function mockSb(fixtures){
  const log=[];
  const db=JSON.parse(JSON.stringify(fixtures));
  const from=table=>{
    const f=[];let op='select',payload=null,single=false,maybe=false,limitN=null,sort=null;
    const b={
      select(){return b},order(c,o){sort={c,asc:o?.ascending!==false};return b},range(){return b},or(v){f.push(r=>true);b._or=v;return b},
      eq(c,v){f.push(r=>String(r[c])===String(v));return b},
      is(c,v){f.push(r=>(r[c]??null)===v);return b},
      not(c,o,v){f.push(r=>!((r[c]??null)===v));return b},
      in(c,vs){f.push(r=>vs.map(String).includes(String(r[c])));return b},
      gte(c,v){f.push(r=>r[c]!=null&&String(r[c])>=String(v));return b},
      lt(c,v){f.push(r=>r[c]!=null&&String(r[c])<String(v));return b},
      lte(c,v){f.push(r=>r[c]!=null&&String(r[c])<=String(v));return b},
      ilike(c,p){const needle=p.replace(/%/g,'').trim().toLowerCase();f.push(r=>String(r[c]||'').toLowerCase().includes(needle));return b},
      textSearch(c,q){const terms=q.toLowerCase().split(/\s+/);f.push(r=>terms.every(t=>String(r[c]||'').toLowerCase().includes(t)));return b},
      limit(n){limitN=n;return b},
      insert(rows){op='insert';payload=rows;return b},
      update(patch){op='update';payload=patch;return b},
      single(){single=true;return b.then(x=>x)},maybeSingle(){maybe=true;return b.then(x=>x)},
      then(res,rej){
        db[table]=db[table]||[];
        let out;
        if(op==='insert'){const rows=(Array.isArray(payload)?payload:[payload]).map(r=>({id:r.id||('gen-'+(db[table].length+1)),...r}));db[table].push(...rows);log.push({table,op,rows});out=rows}
        else if(op==='update'){out=db[table].filter(r=>f.every(fn=>fn(r)));out.forEach(r=>Object.assign(r,payload));log.push({table,op,patch:payload,count:out.length})}
        else{out=db[table].filter(r=>f.every(fn=>fn(r)));if(sort)out=[...out].sort((a,b)=>(String(a[sort.c]??'')<String(b[sort.c]??'')?-1:String(a[sort.c]??'')>String(b[sort.c]??'')?1:0)*(sort.asc?1:-1));if(limitN!=null)out=out.slice(0,limitN)}
        const data=single||maybe?(out[0]||null):out;
        return Promise.resolve({data,error:single&&!out[0]?{message:'no rows'}:null}).then(res,rej);
      }
    };
    return b;
  };
  return {from,rpc:async(name,args)=>{log.push({rpc:name,args});const t=db.minds_work_threads.find(x=>x.id===args.p_thread_id);t.conversation_id='conv-new';return {data:'conv-new',error:null}},log,db};
}
const U='owner-1',NOW=new Date('2026-11-04T09:00:00Z'),TODAY=localDay(NOW);
function fixture(){
  return {
    isabella_projects:[{id:'p-b',client_key:'bernried',name:'Bernried',archived:false,user_id:U},{id:'p-s',client_key:'schwarz',name:'BV Schwarz',archived:false,user_id:U},{id:'p-x',client_key:'old',name:'Altprojekt',archived:true,user_id:U}],
    isabella_tasks:[
      {id:'t1',title:'Treppen',start_date:addDays(TODAY,-3),due_date:addDays(TODAY,4),completed_at:null,archived_at:null,project_id:'p-b',user_id:U},
      {id:'t2',title:'Herr Fichtl anrufen',due_date:addDays(TODAY,-1),completed_at:null,archived_at:null,project_id:'p-b',user_id:U},
      {id:'t3',title:'LP2 Abgabe',due_date:addDays(TODAY,9),completed_at:null,archived_at:null,project_id:'p-s',user_id:U},
      {id:'t4',title:'Erledigt',due_date:TODAY,completed_at:'2026-11-03T10:00:00Z',archived_at:null,project_id:'p-b',user_id:U}],
    isabella_events:[],
    minds_work_buckets:[{id:'b1',name:'Grundrisse',sort_order:1,archived:false,project_id:'p-b',user_id:U}],
    minds_work_folders:[{id:'f1',parent_id:null,name:'02 Entwurf',sort_order:1,project_id:'p-b',user_id:U},{id:'f2',parent_id:'f1',name:'Schnitte',sort_order:1,project_id:'p-b',user_id:U}],
    minds_work_files:[{id:'x1',folder_id:'f2',name:'Schnitt A-A.pdf',mime_type:'application/pdf',size_bytes:204800,source_kind:'document',index_status:'indexed',project_id:'p-b',user_id:U,created_at:'2026-10-20T08:00:00Z'}],
    minds_work_source_segments:[
      {file_id:'x1',project_id:'p-b',user_id:U,source_version:'v2',segment_no:0,segment_kind:'page_text',locator:{page:1},content:'Die Treppe im Norden erfüllt die Barrierefreiheit nach DIN 18040.',created_at:'2026-10-21T00:00:00Z'},
      {file_id:'x1',project_id:'p-b',user_id:U,source_version:'v2',segment_no:1,segment_kind:'page_text',locator:{page:2},content:'Brandschutz: zweiter Rettungsweg über die Außentreppe.',created_at:'2026-10-21T00:00:00Z'},
      {file_id:'x1',project_id:'p-b',user_id:U,source_version:'v1',segment_no:0,segment_kind:'page_text',locator:{},content:'alte Fassung',created_at:'2026-10-01T00:00:00Z'}],
    minds_work_project_people:[{project_id:'p-b',person_id:'pe1',user_id:U}],
    isabella_people:[{id:'pe1',name:'Herr Fichtl',relationship:'ELT',user_id:U},{id:'pe2',name:'Familia',relationship:'hija',user_id:U}],
    minds_work_memory:[{memory_type:'decision',title:'Treppe Nord bleibt',body:'Entscheidung vom 20.10.',status:'confirmed',project_id:'p-b',user_id:U}],
    minds_work_claims:[{claim_type:'deadline',statement:'LP2 Abgabe am 13.11.',status:'confirmed',provenance_class:'project_source',project_id:'p-b',user_id:U}],
    minds_work_threads:[{id:'th1',title:'HLS & TWP',summary:'',status:'active',project_id:'p-b',conversation_id:'conv-1',user_id:U,updated_at:'2026-11-01T00:00:00Z'}],
    conversation_messages:[{conversation_id:'conv-1',user_id:U,role:'user',content:'¿Qué falta de TWP?',created_at:'2026-11-01T10:00:00Z',metadata:{}},
      {conversation_id:'conv-1',user_id:U,role:'assistant',content:'Falta la Statik der Treppe.',created_at:'2026-11-01T10:00:05Z',metadata:{}}]
  };
}
let n=0;const make=fx=>{const sb=mockSb(fx||fixture());return {sb,tools:createWindowTools({sb,userId:U,now:()=>NOW,uuid:()=>'uuid-'+(++n)})}};

test('Projects resolve by name, key or partial match, and refuse to guess',async()=>{
  const {tools}=make();
  assert.equal((await tools.resolveProject('bernried')).id,'p-b');
  assert.equal((await tools.resolveProject('Schwarz')).id,'p-s');
  await assert.rejects(tools.resolveProject('Altprojekt'),ToolError,'archived projects are hidden');
  await assert.rejects(tools.resolveProject('Montoro'),/No encuentro el proyecto "Montoro"\. Proyectos en Window: Bernried, BV Schwarz/);
  assert.deepEqual((await tools.listProjects()).projects.map(p=>p.name),['Bernried','BV Schwarz']);
});

test('Today means overdue, due today and multi-day tasks in progress',async()=>{
  const {tools}=make();
  const r=await tools.listTasks({range:'today'});
  assert.deepEqual(r.tasks.map(t=>t.id).sort(),['t1','t2']);
  assert.equal(r.tasks.find(t=>t.id==='t2').overdue,true);
  assert.equal(r.tasks.find(t=>t.id==='t1').project,'Bernried');
  const done=await tools.listTasks({range:'done_recent'});
  assert.deepEqual(done.tasks.map(t=>t.id),['t4']);
});

test('Project context gives Claude the desktop, people of the project only, memory and threads',async()=>{
  const {tools}=make();
  const c=await tools.projectContext({project:'Bernried'});
  assert.deepEqual(c.desktop.folders,['02 Entwurf','02 Entwurf / Schnitte']);
  assert.equal(c.desktop.files[0].folder,'02 Entwurf / Schnitte');
  assert.equal(c.desktop.files[0].text,'disponible');
  assert.deepEqual(c.people,[{name:'Herr Fichtl',role:'ELT'}],'no personal contacts outside the project');
  assert.equal(c.project_memory[0].title,'Treppe Nord bleibt');
  assert.equal(c.threads[0].title,'HLS & TWP');
  assert.deepEqual(c.open_tasks.map(t=>t.id).sort(),['t1','t2']);
});

test('Search returns snippets with file ids; read_file pages the latest extraction',async()=>{
  const {tools}=make();
  const s=await tools.searchFiles({query:'Treppe Barrierefreiheit',project:'Bernried'});
  assert.equal(s.matches[0].file,'Schnitt A-A.pdf');
  assert.match(s.matches[0].snippet,/Barrierefreiheit nach DIN 18040/);
  await assert.rejects(tools.searchFiles({query:'a'}),/al menos dos caracteres/);
  const f=await tools.readFile({file_id:'x1'});
  assert.equal(f.segments_total,2,'older extraction versions are ignored');
  assert.match(f.text,/^\[p\. 1\]\nDie Treppe[\s\S]*\[p\. 2\]\nBrandschutz/);
  assert.equal(f.more,undefined);
});

test('Tasks created from Claude sync into Window like any other task',async()=>{
  const {tools,sb}=make();
  const r=await tools.createTask({title:'Statik Treppe anfragen',project:'Bernried',start_date:addDays(TODAY,1),due_date:addDays(TODAY,3)});
  const row=sb.log.find(x=>x.table==='isabella_tasks'&&x.op==='insert').rows[0];
  assert.equal(row.client_key,row.id,'the PWA keys tasks by client_key');
  assert.equal(row.project_id,'p-b');
  assert.deepEqual(row.metadata,{source:'claude_connector'});
  assert.equal(r.created.project,'Bernried');
  await assert.rejects(tools.createTask({title:'x',due_date:'31.12.2026'}),/AAAA-MM-DD/);
  await assert.rejects(tools.createTask({title:'x',start_date:'2026-12-10',due_date:'2026-12-01'}),/posterior/);
  const u=await tools.updateTask({task_id:'t2',done:true});
  assert.equal(u.updated.done,true);
  await assert.rejects(tools.updateTask({task_id:'t2'}),/No hay cambios/);
});

test('Saving to a thread creates it if needed and stores the exchange as Claude',async()=>{
  const {tools,sb}=make();
  const r=await tools.saveToThread({project:'Bernried',thread_title:'Brandschutz Treppe',summary:'Zweiter Rettungsweg geklärt.',
    entries:[{role:'user',content:'¿Cumple el segundo Rettungsweg?'},{role:'assistant',content:'Sí, por la Außentreppe (Schnitt A-A, p. 2).'}]});
  assert.equal(r.saved.thread,'Brandschutz Treppe');
  assert.equal(r.saved.messages,2);
  assert.ok(sb.log.some(x=>x.rpc==='minds_ensure_work_thread_conversation'));
  const msgs=sb.log.find(x=>x.table==='conversation_messages'&&x.op==='insert').rows;
  assert.deepEqual(msgs.map(m=>m.role),['user','assistant']);
  assert.ok(msgs.every(m=>m.metadata.source==='claude_connector'&&m.metadata.app==='work_thread'&&m.conversation_id==='conv-new'));
  assert.ok(msgs[0].created_at<msgs[1].created_at,'order is preserved');
  const again=await tools.saveToThread({thread_id:'th1',entries:[{role:'assistant',content:'Nota'}]});
  assert.equal(again.saved.thread,'HLS & TWP');
  const t=await tools.readThread({thread_id:'th1'});
  assert.deepEqual(t.messages.map(m=>m.author),['Gari','Isabella','Claude']);
  await assert.rejects(tools.saveToThread({project:'Bernried'}),/No hay nada que guardar/);
});

test('The connector answers 401 with a metadata pointer and runs without the gateway JWT check',()=>{
  const fn=read('supabase/functions/window-mcp/index.ts'),cfg=read('supabase/config.toml');
  assert.match(fn,/const RESOURCE=SUPABASE_URL\+"\/functions\/v1\/window-mcp";/);
  assert.match(fn,/"WWW-Authenticate":`Bearer resource_metadata="\$\{METADATA_URL\}"/);
  assert.match(fn,/authorization_servers:\[SUPABASE_URL\+"\/auth\/v1"\]/);
  assert.match(fn,/await sb\.auth\.getUser\(token\)/);
  assert.match(cfg,/\[functions\.window-mcp\]\s*\nverify_jwt = false\nentrypoint = "\.\/functions\/window-mcp\/index\.ts"/);
  for(const name of ['overview','open_project','open_topic','search','fetch','list_tasks','list_events','create_task','update_task','close_session','record_decision','file_document','update_project_brief','rename_topic'])
    assert.ok(fn.includes('registerTool("'+name+'"'),name);
});

test('Consent page shows the asking app and its return host, and signs in by email code',()=>{
  const html=read('apps/isabella/oauth-consent.html'),js=read('apps/isabella/oauth-consent.js');
  assert.match(html,/<script src="\.\.\/shared\/supabase-client\.js"><\/script>\s*<script src="\.\/oauth-consent\.js\?v=1"><\/script>/);
  assert.match(js,/sb\.auth\.oauth/);
  assert.match(js,/api\.getAuthorizationDetails\(authorizationId\)/);
  assert.match(js,/approveAuthorization\(authorizationId\):await api\.denyAuthorization\(authorizationId\)/);
  assert.match(js,/'Volverá a: '\+hostOf\(redirect\)/);
  assert.match(js,/signInWithOtp\(\{email,options:\{shouldCreateUser:false\}\}\)/);
  assert.match(js,/if\(!\/\^https\?:\$\/\.test\(u\.protocol\)\)throw/);
  assert.match(html,/no le muestra tu chat personal con Isabella/);
});

test('Work threads sign the replies Claude saved',()=>{
  const work=read('apps/isabella/work.js');
  assert.match(work,/m\.metadata\?\.source==='claude_connector'&&role==='assistant'\?'<div class="work-thread-author">Claude<\/div>'/);
});

test('Edge Functions deploy only by hand, from main, with the token scoped to one environment',()=>{
  const wf=read('.github/workflows/deploy-functions.yml');
  assert.match(wf,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(wf,/\n  push:|\n  pull_request:|\n  schedule:/);
  assert.match(wf,/github\.ref == 'refs\/heads\/main'/);
  assert.match(wf,/environment: supabase/);
  assert.match(wf,/\[\[ "\$f" =~ \^\[a-z0-9-\]\+\$ \]\]/);
  assert.match(wf,/supabase functions deploy "\$f" --project-ref "\$PROJECT_REF" --use-api/);
  assert.match(wf,/Expected 401 from window-mcp/);
});
