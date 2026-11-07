// 07.11.2026, Gari: the Window connector may read Isabella's chat history (read-only), so Claude can study
// how she answers and continue conversations. Only his Isabella chats and Work threads; Theory stays out.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWindowTools,ToolError} from '../supabase/functions/_shared/window-tools.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const U='u-1';
function fakeSb(tables,log=[]){
  return {from(table){
    const q={table,ops:[]};log.push(q);
    const chain=new Proxy({},{get(_,name){
      if(name==='then')return ok=>ok({data:tables(table,q),error:null});
      return (...args)=>{q.ops.push([name,...args]);return chain};
    }});
    return chain;
  }};
}
const chats=[
  {id:'c-thread',app_scope:'work_thread',title:'Lichtplanung',created_at:'2026-10-20T08:00:00Z',updated_at:'2026-11-07T10:00:00Z'},
  {id:'c-main',app_scope:'isabella',title:'Isabella',created_at:'2026-09-25T08:00:00Z',updated_at:'2026-11-07T09:00:00Z'}];
const messages=[
  {conversation_id:'c-main',role:'assistant',content:'Claro. ¿Quieres que lo agende?',created_at:'2026-11-07T08:00:02Z',metadata:{}},
  {conversation_id:'c-main',role:'user',content:'Recuérdame llamar a Fichtl',created_at:'2026-11-07T08:00:00Z',metadata:{}},
  {conversation_id:'c-main',role:'assistant',content:'Buenos días',created_at:'2026-11-06T07:00:00Z',metadata:{}}];

test('list_chats: only Isabella chats and Work threads, the main chat marked', async()=>{
  const log=[];
  const sb=fakeSb((t)=>t==='conversations'?chats:t==='minds_work_threads'?[{id:'th',title:'Lichtplanung',project_id:'p1',conversation_id:'c-thread'}]:t==='isabella_projects'?[{id:'p1',name:'Bernried',client_key:'bernried'}]:[],log);
  const r=await createWindowTools({sb,userId:U}).listChats();
  assert.deepEqual(r.chats.map(c=>[c.id,c.kind,c.project||null]),[['c-thread','work_thread','Bernried'],['c-main','main',null]]);
  const conv=log.find(q=>q.table==='conversations');
  assert.ok(conv.ops.some(o=>o[0]==='eq'&&o[1]==='user_id'&&o[2]===U));
  assert.ok(conv.ops.some(o=>o[0]==='in'&&o[1]==='app_scope'&&o[2].join()==='isabella,work_thread'),'Theory stays out');
});

test('read_chat: main chat by default, chronological, paged with next_before, canonical turns only', async()=>{
  const log=[];
  const sb=fakeSb((t)=>t==='conversations'?chats:t==='conversation_messages'?messages:[],log);
  const r=await createWindowTools({sb,userId:U}).readChat({limit:2});
  assert.equal(r.chat.id,'c-main');
  assert.deepEqual(r.messages.map(m=>[m.author,m.content]),[['Gari','Recuérdame llamar a Fichtl'],['Isabella','Claro. ¿Quieres que lo agende?']]);
  assert.equal(r.next_before,'2026-11-07T08:00:00Z');
  const q=log.find(x=>x.table==='conversation_messages');
  for(const [op,col,val] of [['eq','user_id',U],['eq','provisional',false]])assert.ok(q.ops.some(o=>o[0]===op&&o[1]===col&&o[2]===val),col);
  assert.ok(q.ops.some(o=>o[0]==='in'&&o[1]==='role'&&o[2].join()==='user,assistant'));
  assert.ok(q.ops.some(o=>o[0]==='in'&&o[1]==='conversation_id'&&o[2].join()==='c-main'));
});

test('read_chat: a query searches every Isabella chat; unknown chats and bad dates are refused', async()=>{
  const log=[];
  const sb=fakeSb((t)=>t==='conversations'?chats:t==='conversation_messages'?messages.slice(0,1):[],log);
  const tools=createWindowTools({sb,userId:U});
  const r=await tools.readChat({query:'agende'});
  assert.deepEqual(r.chat,{search:'agende',chats:2});
  const q=log.find(x=>x.table==='conversation_messages');
  assert.ok(q.ops.some(o=>o[0]==='ilike'&&o[1]==='content'&&o[2]==='%agende%'));
  assert.equal(r.messages[0].chat,'Isabella');
  await assert.rejects(()=>tools.readChat({chat_id:'theory-1'}),ToolError);
  await assert.rejects(()=>tools.readChat({from:'7.11.'}),ToolError);
});

test('The server registers both tools as read-only', ()=>{
  const src=read('supabase/functions/window-mcp/index.ts');
  assert.match(src,/registerTool\("list_chats",\{[^]*?annotations:READ\},run\(\(\)=>tools\.listChats\(\)\)\)/);
  assert.match(src,/registerTool\("read_chat",\{[^]*?annotations:READ\},run\(a=>tools\.readChat\(a\)\)\)/);
  assert.match(src,/not confirmed facts; never write it into the Akte without his OK/);
});
