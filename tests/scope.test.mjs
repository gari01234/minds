import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const scopeSource=read('shared/conversation-scope.js');
function scope(storage={}) {
  const ctx={window:{},localStorage:{getItem:k=>storage[k]??null}};
  vm.runInNewContext(scopeSource,ctx);
  return ctx.window.MINDS_CONVERSATION_SCOPE;
}
test('legacy contaminated cache excludes Isabella even when its metadata was overwritten',()=>{
  const old=[{id:'theory',origin:{type:'global',id:'global'}},
    {id:'isabella',metadata:{app:'isabella'}},
    {id:'lost-label',origin:{type:'assistant',id:'isabella'}},
    {id:'explicit',app_scope:'isabella',origin:{type:'global'}}];
  const storage={minds_theory_v09_conversations:JSON.stringify(old)};
  assert.equal(JSON.stringify(scope(storage).readTheoryCache().map(c=>c.id)),JSON.stringify(['theory']));
  assert.equal(JSON.parse(storage.minds_theory_v09_conversations).length,4);
  storage[scope().theoryKey]='[]';
  assert.equal(scope(storage).readTheoryCache().length,0);
});
function db() {
  const conversations=[{id:'t',app_scope:'theory',origin_kind:'global'},
    {id:'i',app_scope:'isabella',origin_kind:'global',origin_anchor:{type:'assistant',id:'isabella'}}];
  const messages=[{conversation_id:'t',role:'user',content:'Theory only'},
    {conversation_id:'i',role:'user',content:'Isabella private'}];
  const calls=[];
  return {calls,from(table){
    const filters=[];let selection='';const call={table,filters};calls.push(call);
    const query={select(s){selection=s;return this},eq(k,v){filters.push([k,v]);return this},order(){return this},limit(){return this},
      then(resolve){let rows=table==='conversations'?conversations:messages.map(m=>({...m,conversations:conversations.find(c=>c.id===m.conversation_id)}));
        for(const [k,v] of filters){if(k==='user_id')continue;rows=rows.filter(r=>k.split('.').reduce((a,p)=>a?.[p],r)===v)}
        return Promise.resolve({data:rows,error:null}).then(resolve)}
    };return query;
  }};
}
test('Theory pulls only its conversations AND messages from a mixed database',async()=>{
  const source=read('apps/theory/v10.js');
  const block=source.slice(source.indexOf('  async function pullConversations(){'),source.indexOf('  // ---------- reading return state'));
  const sb=db();const ctx={sb,APP_SCOPE:'theory',state:{threadSlugById:new Map()}};
  vm.runInNewContext(block+';this.pull=pullConversations;',ctx);
  const rows=await ctx.pull();
  assert.equal(rows.length,1);assert.equal(rows[0].id,'t');
  assert.equal(rows[0].messages.length,1);assert.equal(rows[0].messages[0].text,'Theory only');
  assert.ok(sb.calls.find(c=>c.table==='conversation_messages').filters.some(([k,v])=>k==='conversations.app_scope'&&v==='theory'));
});
test('Isabella pulls only its own conversation and messages',async()=>{
  const source=read('apps/isabella/sync.js');
  const block=source.slice(source.indexOf('async function pullConversation(){'),source.indexOf('async function syncNow('));
  const ctx={sb:db(),APP_SCOPE:'isabella',user:{id:'user'}};
  vm.runInNewContext(block+';this.pull=pullConversation;',ctx);
  const rows=await ctx.pull();assert.equal(rows.length,1);assert.equal(rows[0].text,'Isabella private');
});
test('both apps retain valid relative shared assets under their published paths',()=>{
  for(const app of ['theory','isabella']) {
    const html=read(`apps/${app}/index.html`);
    for(const [,url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if(/^(https?:|data:)/.test(url))continue;
      const path=url.split('?')[0];
      const target=path.startsWith('../shared/')?'shared/'+path.slice('../shared/'.length):`apps/${app}/${path}`;
      assert.ok(existsSync(new URL(target,root)),`${app}: missing ${path}`);
    }
  }
});
