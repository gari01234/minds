import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const theory=readFileSync(new URL('../apps/theory/v09.js',import.meta.url),'utf8');
const start=theory.indexOf('let openConvId=null;');
const end=theory.indexOf('function conversationHeader(c){',start);
assert.ok(start>=0&&end>start);
const helper=theory.slice(start,end);
const storage={};
function harness(){
  const textarea={value:''};
  const context=vm.createContext({
    convKey:'minds_theory_v09_test',
    safeJSON:(key,fallback)=>storage[key]??fallback,
    saveJSON:(key,value)=>{storage[key]=JSON.parse(JSON.stringify(value));return true},
    sheet:{dataset:{kind:'chat'}},
    sheetBody:{querySelector:selector=>selector==='.v09-chat-form textarea'?textarea:null}
  });
  vm.runInContext(helper+';globalThis.drafts={setSofiaDraft,captureSofiaDraft,read:id=>sofiaDrafts[id]||""}',context);
  return {context,textarea,drafts:context.drafts};
}
test('90.5 Sofía preserves exact unsent text per conversation across close/reopen and reload',()=>{
  const first=harness();
  first.textarea.value='Un argumento sobre\nla reducción todavía incompleto';
  vm.runInContext("openConvId='reading-a';captureSofiaDraft()",first.context);
  first.drafts.setSofiaDraft('reading-b','Otra conversación');
  assert.equal(storage['minds_theory_v09_test:sofia-drafts-v1']['reading-a'],first.textarea.value);
  const reopened=harness();
  assert.equal(reopened.drafts.read('reading-a'),first.textarea.value);
  assert.equal(reopened.drafts.read('reading-b'),'Otra conversación');
  assert.notEqual(reopened.drafts.read('reading-a'),reopened.drafts.read('reading-b'));
});
test('90.5 drafts clear only after explicit send, and no draft creates a conversation message',()=>{
  const view=harness();
  view.drafts.setSofiaDraft('reading-a','A medio escribir');
  view.drafts.setSofiaDraft('reading-a','');
  assert.equal(view.drafts.read('reading-a'),'');
  assert.ok(!('reading-a' in storage['minds_theory_v09_test:sofia-drafts-v1']));
  assert.match(theory,/const q=ta\.value\.trim\(\);if\(!q\)return;[\s\S]{0,65}setSofiaDraft\(c\.id,''\);ta\.value=''/);
  assert.match(theory,/ta\.addEventListener\('input',\(\)=>\{autosize\(\);setSofiaDraft\(c\.id,ta\.value\)\}\)/);
  assert.match(theory,/ta\.value=String\(sofiaDrafts\[c\.id\]\|\|''\)/);
  assert.match(theory,/const sofiaDraftKey=convKey\+':sofia-drafts-v1'/);
});
test('90.5 preserving the draft precedes replacing the sheet and changing conversation identity',()=>{
  assert.match(theory,/function openSheet\(kicker,title,html,kind='default'\)\{\s*captureSofiaDraft\(\);/);
  const convo=theory.slice(theory.indexOf('function openConversation(cOrId){'),theory.indexOf('function askFromOrigin(',theory.indexOf('function openConversation(cOrId){')));
  assert.ok(convo.indexOf("openSheet('MINDS · SOFÍA'")<convo.indexOf('openConvId=c.id;'));
  assert.match(theory,/if\(wasChat\)captureSofiaDraft\(\)/);
  assert.match(theory,/if\(type==='minds:sofia-close'\)\{captureSofiaDraft\(\)/);
  assert.match(theory,/ta\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\)/);
  assert.match(theory,/setSofiaDraft\(openConvId,ta\.value\)/);
});
