import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migrations=()=>readdirSync(new URL('supabase/migrations/',root))
  .filter(x=>x.endsWith('.sql'))
  .map(x=>read('supabase/migrations/'+x))
  .join('\n');

test('Build 78 adds Threads as a fourth Work surface',()=>{
  const shell=read('apps/isabella/shell.js');
  const work=read('apps/isabella/work.js');
  assert.ok(shell.includes('data-work-view="threads"'));
  assert.ok(work.includes("if(view==='threads')await renderThreads()"));
  assert.ok(work.includes("from('minds_work_threads')"));
  assert.ok(work.includes("minds_ensure_work_thread_conversation"));
  assert.ok(work.includes('window.ISABELLA_AI.ask(message,state,{workThread:'));
});

test('Build 78 keeps one Isabella while giving each Work Thread its own conversation',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  const ai=read('apps/isabella/ai.js');
  assert.ok(chat.includes('current_work_thread:currentWorkThread?'));
  assert.ok(chat.includes('currentWorkThread?[]:(context.recent_local_conversation || [])'));
  assert.ok(chat.includes('app_scope","work_thread"'));
  assert.ok(chat.includes('PROJECT THREAD MODE:'));
  assert.ok(chat.includes('el Thread no crea otra personalidad ni otro cerebro'));
  assert.ok(ai.includes('work_thread_id:options.workThread?.id||null'));
  assert.ok(ai.includes('if(!options.workThread&&!options.background'));
});

test('Build 78 makes sibling Threads searchable without promoting them to project truth',()=>{
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.ok(chat.includes('async function searchWorkThreads'));
  assert.ok(chat.includes('name:"search_work_threads"'));
  assert.ok(chat.includes('work_thread_conversation'));
  assert.ok(chat.includes('accepted_fact:false'));
  assert.ok(chat.includes('thread_conversations_are_not_project_truth:true'));
  assert.ok(chat.includes('threads:threadRows?.threads||[]'));
});

test('Build 78 schema keeps Threads project-scoped and RLS protected',()=>{
  const sql=migrations();
  assert.ok(sql.includes('create table if not exists public.minds_work_threads')||sql.includes('create table public.minds_work_threads'));
  assert.ok(sql.includes("work_thread'::text")||sql.includes("'work_thread'"));
  assert.ok(sql.includes('enable row level security'));
  assert.ok(sql.includes('work_threads_insert_own_project'));
  assert.ok(sql.includes('minds_ensure_work_thread_conversation'));
  assert.ok(sql.includes("revoke all on function public.minds_ensure_work_thread_conversation(uuid) from anon"));
});

test('Build 78 current PWA assets are aligned',()=>{
  const shell=read('apps/isabella/shell.js');
  const index=read('apps/isabella/index.html');
  const sw=read('apps/isabella/sw.js');
  assert.ok(shell.includes('Build 2026.10.04.78'));
  assert.ok(index.includes('app.css?v=54'));
  assert.ok(index.includes('shell.js?v=78'));
  assert.ok(index.includes('work.js?v=5'));
  assert.ok(index.includes('ai.js?v=47'));
  assert.ok(sw.includes("isabella-shell-v88"));
});

test('Build 78 Work client remains valid JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(read('apps/isabella/work.js')));
  assert.doesNotThrow(()=>new Function(read('apps/isabella/ai.js')));
});
