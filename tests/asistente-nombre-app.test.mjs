// The name each Office member gives the assistant (28.11.2026) reaches the page: office-personal.js keeps it
// (isabella_preferences, assistant_name), exposes window.MINDS_ASSISTANT_NAME and fills the marked elements;
// the shared Live client, AI client and translations use it; German in Live speaks «du» (Gari: «Quiero que
// tutee»). Checked on the source and in a small sandbox, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../apps/isabella/'+p,import.meta.url),'utf8');
const personal=read('office-personal.js'),live=read('live/live.js'),ai=read('ai.js');

test('«Mein Assistent»: name, nickname and how it calls you, saved in the member\'s own preference',()=>{
  assert.match(personal,/const NAME_KEY='assistant_name',DEFAULT_NAME='KI-Assistent'/);
  assert.match(personal,/sb\.from\('isabella_preferences'\)\.upsert\(\{\n\s+user_id:id,preference_key:NAME_KEY,value,/);
  assert.match(personal,/field\('name','Wie soll dein Assistent heißen\?',DEFAULT_NAME,40\);/);
  assert.match(personal,/field\('spitzname','Spitzname \(optional\)','z\. B\. Sam',24\);/);
  assert.match(personal,/field\('rufname','Wie soll er dich nennen\? \(optional\)','dein Vorname',40\);/);
  assert.match(personal,/const b=t\('button','Mein Assistent','office-assistant-menu-action'\);/);
  assert.doesNotMatch(personal,/\bRomy\b/);
});

test('the page follows the chosen name; until then «KI-Assistent»; never another person\'s name',()=>{
  const elements=[];
  const el=(data)=>{const e={dataset:data,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v}};elements.push(e);return e};
  const nameEl=el({assistantName:''}),input=el({assistantPlaceholder:'Nachricht an {name} …'}),button=el({assistantAria:'Live mit {name}'});
  const store=new Map([['minds-assistant-name',JSON.stringify({name:'Samantha',spitzname:'Sam'})]]);
  const window={APP_PROFILE:'office',dispatchEvent(){},CustomEvent:class{},
    MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}},from(){throw Error('offline')}}};
  const document={querySelectorAll:sel=>elements.filter(e=>sel==='[data-assistant-name]'?'assistantName' in e.dataset:sel==='[data-assistant-placeholder]'?'assistantPlaceholder' in e.dataset:sel==='[data-assistant-aria]'?'assistantAria' in e.dataset:false),getElementById:()=>null};
  vm.runInNewContext(personal,{window,document,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},CustomEvent:class{},console});
  assert.equal(window.MINDS_ASSISTANT_NAME(),'Samantha');
  assert.equal(nameEl.textContent,'Samantha');
  assert.equal(input.attrs.placeholder,'Nachricht an Samantha …');
  assert.equal(button.attrs['aria-label'],'Live mit Samantha');
  assert.match(personal,/if\(!session\?\.user\?\.id\)\{identity=\{\};try\{localStorage\.removeItem\(CACHE\)\}catch\{\};applyName\(\);\}/);
});

test('Live and the AI client use the chosen name; Live\'s German speaks «du»',()=>{
  assert.match(live,/const who=\(\)=>\{\n\s+for\(const w of \[window,window\.parent\]\)/);
  assert.doesNotMatch(live,/\bRomy\b/);
  assert.doesNotMatch(live,/lv\("[^"]*","[^"]*\b(Sie|Ihre|Ihnen)\b[^"]*"\)/,'no «Sie» in Live');
  assert.match(live,/"Ich höre zu\. Sprich ganz normal\."/);
  assert.match(ai,/const dialogueAssistant=officeChat\?officeName\(\):'Isabella';/);
  assert.doesNotMatch(ai,/'Romy'/);
});
