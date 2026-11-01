import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWindowTools,localDay,addDays} from '../supabase/functions/_shared/window-tools.mjs';
import {createAkteTools,matchTopic,renderThemenblatt} from '../supabase/functions/_shared/window-akte.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

// PostgREST-like mock with JSON-path filters, or(), storage and rpc.
function mockSb(fx){
  const db=JSON.parse(JSON.stringify(fx)),log=[],storage=[];
  const val=(r,c)=>c.includes('->>')?((r[c.split('->>')[0]]||{})[c.split('->>')[1]]??null):r[c];
  const from=table=>{
    const f=[];let op='select',payload=null,single=false,maybe=false,limitN=null,sort=null;
    const b={select(){return b},range(){return b},order(c,o){sort={c,asc:o?.ascending!==false};return b},
      eq(c,v){f.push(r=>String(val(r,c))===String(v));return b},is(c,v){f.push(r=>(val(r,c)??null)===v);return b},
      not(c,o,v){f.push(r=>!((val(r,c)??null)===v));return b},in(c,vs){f.push(r=>vs.map(String).includes(String(val(r,c))));return b},
      gte(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))>=String(v));return b},lt(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))<String(v));return b},
      lte(c,v){f.push(r=>val(r,c)!=null&&String(val(r,c))<=String(v));return b},
      ilike(c,p){const n=p.replace(/%/g,'').trim().toLowerCase();f.push(r=>String(val(r,c)||'').toLowerCase().includes(n));return b},
      or(expr){const parts=expr.split(',').map(x=>x.split('.ilike.'));f.push(r=>parts.some(([c,p])=>String(val(r,c)||'').toLowerCase().includes(String(p||'').replace(/%/g,'').trim().toLowerCase())));return b},
      textSearch(c,q){const t=q.toLowerCase().split(/\s+/);f.push(r=>t.every(x=>String(val(r,c)||'').toLowerCase().includes(x)));return b},
      limit(n){limitN=n;return b},insert(rows){op='insert';payload=rows;return b},update(p){op='update';payload=p;return b},
      single(){single=true;return b.then(x=>x)},maybeSingle(){maybe=true;return b.then(x=>x)},
      then(res,rej){db[table]=db[table]||[];let out;
        if(op==='insert'){const rows=(Array.isArray(payload)?payload:[payload]).map(r=>({id:r.id||(table+'-'+(db[table].length+1)),created_at:r.created_at||'2026-11-04T09:00:00Z',updated_at:'2026-11-04T09:00:00Z',...r}));db[table].push(...rows);log.push({table,op,rows});out=rows}
        else if(op==='update'){out=db[table].filter(r=>f.every(fn=>fn(r)));out.forEach(r=>Object.assign(r,payload));log.push({table,op,patch:payload,count:out.length})}
        else{out=db[table].filter(r=>f.every(fn=>fn(r)));if(sort)out=[...out].sort((a,b)=>(String(a[sort.c]??'')<String(b[sort.c]??'')?-1:String(a[sort.c]??'')>String(b[sort.c]??'')?1:0)*(sort.asc?1:-1));if(limitN!=null)out=out.slice(0,limitN)}
        return Promise.resolve({data:single||maybe?(out[0]||null):out,error:single&&!out[0]?{message:'no rows'}:null}).then(res,rej)}};
    return b;};
  return {from,log,db,storage,
    rpc:async(name,args)=>{log.push({rpc:name,args});if(name==='minds_ensure_work_thread_conversation'){const t=db.minds_work_threads.find(x=>x.id===args.p_thread_id);t.conversation_id='conv-'+t.id;return {data:t.conversation_id,error:null}}
      if(name==='minds_rename_work_thread'){db.minds_work_threads.find(x=>x.id===args.p_thread_id).title=args.p_title;return {data:true,error:null}}return {data:null,error:null}},
    storage:{from:bucket=>({upload:async(path,blob,opts)=>{storage.push({bucket,path,opts,text:await blob.text()});return {error:null}},remove:async()=>({error:null})})},
    _storage:storage};
}
const U='owner-1',NOW=new Date('2026-11-04T09:00:00Z'),TODAY=localDay(NOW);
const fixture=()=>({
  isabella_projects:[{id:'p-b',client_key:'bernried',name:'Bernried',archived:false,user_id:U}],
  minds_work_threads:[
    {id:'th-licht',title:'Lichtplanung',summary:'',status:'active',project_id:'p-b',conversation_id:null,metadata:{},user_id:U,updated_at:'2026-11-01'},
    {id:'th-hls',title:'HLS & TWP',summary:'Kick-off vorbereitet',status:'active',project_id:'p-b',conversation_id:'conv-hls',metadata:{themenblatt:{stand:'Kick-off vorbereitet; Jour fixe am 13.10.',entscheidungen:[{text:'Grundrisse VA03 an Fachplaner',datum:'2026-10-08'}],offene_fragen:['RLT-Raum Dimension?'],naechste_schritte:['Deckenstärke prüfen'],aktualisiert_am:'2026-10-09T12:00:00Z',aktualisiert_von:'Claude'}},user_id:U,updated_at:'2026-10-09'},
    {id:'th-licht2',title:'Lichtkonzept Fassade',summary:'',status:'active',project_id:'p-b',conversation_id:null,metadata:{},user_id:U,updated_at:'2026-10-01'}],
  minds_work_memory:[{id:'mem-1',project_id:'p-b',user_id:U,memory_type:'decision',title:'Treppe Nord bleibt',body:'',status:'proposed',created_at:'2026-11-01T00:00:00Z',metadata:{}}],
  minds_work_folders:[{id:'f-mail',parent_id:null,name:'Emails',project_id:'p-b',user_id:U}],
  minds_work_files:[
    {id:'x1',folder_id:'f-mail',name:'AW_ Termin.pdf',index_status:'indexed',project_id:'p-b',user_id:U,created_at:'2026-10-23',metadata:{}},
    {id:'x2',folder_id:'f-mail',name:'AW_ Termin.pdf',index_status:'indexed',project_id:'p-b',user_id:U,created_at:'2026-10-22',metadata:{}}],
  minds_work_source_segments:[{file_id:'x1',project_id:'p-b',user_id:U,segment_no:0,content:'Die Behinderungsanzeige wurde am 20.10. versendet.',source_version:'v',created_at:'2026-10-23'}],
  isabella_tasks:[{id:'t1',title:'Herr Fichtl anrufen',due_date:addDays(TODAY,1),completed_at:null,archived_at:null,project_id:'p-b',user_id:U}],
  conversation_messages:[{conversation_id:'conv-hls',user_id:U,role:'assistant',content:'Stand HLS…',created_at:'2026-10-09T12:59:00Z',metadata:{}}]
});
let n=0;const make=()=>{const sb=mockSb(fixture());const base=createWindowTools({sb,userId:U,now:()=>NOW,uuid:()=>'uuid-'+(++n)});return {sb,akte:createAkteTools({sb,userId:U,base,now:()=>NOW,uuid:()=>'uuid-'+(++n)})}};

test('Topics match loosely but never guess between similar ones',()=>{
  const th=fixture().minds_work_threads;
  assert.equal(matchTopic(th,'lichtplanung').match.id,'th-licht');
  assert.equal(matchTopic(th,'Lichtplanung Bernried 3. BA').match.id,'th-licht');
  assert.equal(matchTopic(th,'HLS').match.id,'th-hls');
  const unclear=matchTopic(th,'Licht');
  assert.equal(unclear.match,null);
  assert.deepEqual(unclear.candidates.map(t=>t.id).sort(),['th-licht','th-licht2']);
});

test('open_project is compact: Steckbrief hint, one-line topics, register, desktop summary',async()=>{
  const {akte}=make();
  const p=await akte.openProject({project:'Bernried'});
  assert.equal(p.projektsteckbrief,null);assert.match(p.hinweis,/update_project_brief/);
  assert.equal(p.themen.find(t=>t.titel==='HLS & TWP').stand,'Kick-off vorbereitet; Jour fixe am 13.10.');
  assert.equal(p.register.offen_zu_bestaetigen,1);
  assert.equal(p.schreibtisch.dateien_gesamt,2);assert.equal(p.schreibtisch.doppelte_namen,1);
  assert.equal(p.schreibtisch.neueste.length,1,'duplicate names collapse in the summary');
  assert.equal(p.aufgaben_naechste_14_tage[0].titel,'Herr Fichtl anrufen');
});

test('open_topic returns the Themenblatt, or candidates when the name is unclear',async()=>{
  const {akte}=make();
  const t=await akte.openTopic({project:'Bernried',topic:'hls & twp'});
  assert.match(t.themenblatt.text,/Stand: Kick-off[\s\S]*Entscheidungen:\n- 08\.10\.2026: Grundrisse VA03[\s\S]*Offene Fragen:\n- RLT/);
  const u=await akte.openTopic({project:'Bernried',topic:'Licht'});
  assert.equal(u.thema_gefunden,false);assert.equal(u.vorschlaege.length,2);
});

test('close_session writes the Themenblatt in German, a handoff, and proposed decisions to the register',async()=>{
  const {akte,sb}=make();
  const r=await akte.closeSession({project:'Bernried',topic:'Lichtplanung Bernried 3. BA',stand:'Schema für EG/1.OG steht, Schnitt Tageslicht offen.',
    entscheidungen:[{text:'Lichtbänder im Ausstellungsraum',quelle:'Besprechung 03.11.',bestaetigt:true},{text:'Downlights im Foyer prüfen'}],
    offene_fragen:['Leuchtenhersteller?'],naechste_schritte:['Schnitt Tageslicht zeichnen'],fristen:[{titel:'Lichtkonzept an ELT',datum:'2026-11-20'}]});
  assert.equal(r.gespeichert,true);assert.equal(r.thema.titel,'Lichtplanung');
  const thread=sb.db.minds_work_threads.find(t=>t.id==='th-licht');
  assert.equal(thread.metadata.themenblatt.stand,'Schema für EG/1.OG steht, Schnitt Tageslicht offen.');
  assert.equal(thread.metadata.themenblatt.aktualisiert_von,'Claude');
  assert.equal(thread.summary,'Schema für EG/1.OG steht, Schnitt Tageslicht offen.');
  const msgs=sb.log.find(x=>x.table==='conversation_messages'&&x.op==='insert').rows;
  assert.match(msgs.at(-1).content,/^\*\*Sitzungsübergabe\*\* · 04\.11\.2026[\s\S]*Downlights im Foyer prüfen \*\(vorgeschlagen\)\*/);
  assert.ok(msgs.every(m=>m.metadata.source==='claude_connector'));
  const reg=sb.db.minds_work_memory.filter(m=>m.metadata?.source==='claude_connector');
  assert.deepEqual(reg.map(m=>[m.memory_type,m.status]).sort(),[['deadline','proposed'],['decision','confirmed'],['decision','proposed']]);
  assert.equal(reg.find(m=>m.memory_type==='deadline').occurred_at,'2026-11-20T12:00:00Z');
  // Saving again keeps decisions, replaces lists, and does not duplicate register entries.
  await akte.closeSession({project:'Bernried',topic:'Lichtplanung',stand:'Schnitt gezeichnet.',entscheidungen:[{text:'Lichtbänder im Ausstellungsraum'}],naechste_schritte:[]});
  assert.equal(thread.metadata.themenblatt.entscheidungen.length,2);
  assert.deepEqual(thread.metadata.themenblatt.naechste_schritte,[]);
  assert.deepEqual(thread.metadata.themenblatt.offene_fragen,['Leuchtenhersteller?']);
  assert.equal(sb.db.minds_work_memory.filter(m=>m.metadata?.source==='claude_connector').length,3);
});

test('A new topic is only created when Gari agreed (neues_thema)',async()=>{
  const {akte,sb}=make();
  const r=await akte.closeSession({project:'Bernried',topic:'Behinderungsanzeige',stand:'Entwurf fertig.'});
  assert.equal(r.gespeichert,false);
  const ok=await akte.closeSession({project:'Bernried',topic:'Behinderungsanzeige',neues_thema:true,stand:'Entwurf fertig.'});
  assert.equal(ok.gespeichert,true);
  assert.ok(sb.db.minds_work_threads.some(t=>t.title==='Behinderungsanzeige'&&t.metadata.themenblatt.stand==='Entwurf fertig.'));
  await assert.rejects(akte.closeSession({project:'Bernried',topic:'Lichtplanung'}),/stand/);
});

test('E-mails are filed as Markdown in the owner’s storage path, once',async()=>{
  const {akte,sb}=make();
  const mail={project:'Bernried',art:'email',von:'Christof Wagner',an:'Edgar Martinez',datum:'2026-10-28',betreff:'Mahnung Beratungsleistung',inhalt:'Sehr geehrter Herr Martinez,\n\nhiermit mahnen wir die Beratungsleistung an …'};
  const r=await akte.fileDocument(mail);
  assert.equal(r.abgelegt,true);assert.equal(r.ordner,'Emails');
  const up=sb._storage[0];
  assert.ok(up.path.startsWith(U+'/bernried/f-mail/'));assert.equal(up.opts.contentType,'text/markdown; charset=utf-8');
  assert.match(up.text,/^# Mahnung Beratungsleistung\n\n\*\*Art:\*\* E-Mail  \n\*\*Datum:\*\* 28\.10\.2026  \n\*\*Von:\*\* Christof Wagner/);
  const file=sb.db.minds_work_files.at(-1);
  assert.equal(file.name,'261028 E-Mail Mahnung Beratungsleistung.md');assert.equal(file.source_kind,'email');assert.match(file.metadata.content_sha256,/^[0-9a-f]{64}$/);
  const again=await akte.fileDocument({...mail,inhalt:'  Sehr geehrter Herr Martinez,\n\n\nhiermit mahnen wir die Beratungsleistung an …  '});
  assert.equal(again.abgelegt,false);assert.equal(sb._storage.length,1,'whitespace changes are the same document');
  const proto=await akte.fileDocument({project:'Bernried',art:'protokoll',titel:'Jour fixe 13.11.',inhalt:'Teilnehmer: TWP, TGA, TBA. Punkte: …'});
  assert.equal(proto.ordner,'Protokolle');assert.ok(sb.db.minds_work_folders.some(f=>f.name==='Protokolle'));
});

test('Steckbrief, search and fetch',async()=>{
  const {akte,sb}=make();
  await akte.updateProjectBrief({project:'Bernried',phase:'LPH 3 Entwurfsplanung',beteiligte:[{rolle:'TWP',name:'Josef Amler'}]});
  const b=await akte.updateProjectBrief({project:'Bernried',meilensteine:[{datum:'2026-11-13',was:'Abgabe Entwurf'}]});
  assert.match(b.projektsteckbrief,/^Phase: LPH 3 Entwurfsplanung\n\nMeilensteine:\n- 13\.11\.2026 – Abgabe Entwurf\n\nBeteiligte:\n- TWP: Josef Amler$/);
  assert.equal(sb.db.minds_work_memory.filter(m=>m.metadata?.kind==='projektsteckbrief').length,1);
  const s=await akte.search({query:'Behinderungsanzeige',project:'Bernried'});
  assert.ok(s.results.some(r=>r.id==='file:x1@0'&&/Behinderungsanzeige/.test(r.text)));
  const f=await akte.fetchItem({id:'topic:th-hls'});
  assert.match(f.text,/^Stand: Kick-off[\s\S]*\[Isabella · 2026-10-09\]\nStand HLS/);
  await assert.rejects(akte.fetchItem({id:'nonsense'}),/id no reconocido/);
});

test('Server: 14 lean tools, German titles, one-click prompts, German Akte rule',()=>{
  const fn=read('supabase/functions/window-mcp/index.ts');
  assert.equal((fn.match(/registerTool\(/g)||[]).length,14);
  for(const p of ['thema_fortsetzen','sitzung_abschliessen','emails_ablegen','jour_fixe_vorbereiten','protokoll_erstellen'])assert.ok(fn.includes('registerPrompt("'+p+'"'),p);
  assert.match(fn,/Everything you WRITE into Window[\s\S]*is in German/);
  assert.match(fn,/title:"Sitzung abschließen"/);
  assert.match(fn,/const akte=createAkteTools\(\{sb,userId:data\.user\.id,base:tools\}\);/);
});

test('Window shows the Themenblatt, a Claude hand-off link, and confirmable register entries',()=>{
  const work=read('apps/isabella/work.js');
  assert.match(work,/updated_at,metadata'\)/);
  assert.match(work,/\$\{themenblattMarkup\(thread\)\}<div class="work-thread-log"/);
  assert.match(work,/'https:\/\/claude\.ai\/new\?q='\+encodeURIComponent\('Retoma en Window el proyecto '\+project\.name/);
  assert.match(work,/data-akte-decide="confirmed">Bestätigen<\/button>/);
  assert.match(work,/update\(patch\)\.eq\('id',id\)\.eq\('status','proposed'\)/);
  assert.equal(renderThemenblatt({stand:'x',offene_fragen:['a']}),'Stand: x\n\nOffene Fragen:\n- a');
});
