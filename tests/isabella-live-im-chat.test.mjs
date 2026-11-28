// Live inside the chat (V2, 28.11.2026; Gari: «V2: sí»). The Live page runs in a sheet over the chat instead of a page
// of its own; what is said is saved to the chat turn by turn and appears there at once. Checked without network: the
// sheet and its frame, the messages between frame and chat (same origin only, a turn only after a verified save), the
// compact layout when framed, and the realtime pull for voice turns.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('apps/isabella/shell.js'),app=read('apps/isabella/app.js'),sync=read('apps/isabella/sync.js');
const page=read('apps/isabella/live/index.html'),client=read('apps/isabella/live/live.js'),css=read('apps/isabella/live/live.css');
const sheetCss=read('apps/isabella/voice-output.css');

test('the chat has a Live sheet with a frame for the Live page; Live keeps its own controls',()=>{
  assert.match(shell,/<div id="liveSheet" class="live-sheet hidden" role="dialog"[^>]*>/);
  assert.match(shell,/<iframe id="liveFrame" class="live-frame" title="[^"]+" allow="microphone; autoplay"><\/iframe>/);
  assert.match(shell,/id="liveSheetClose"/);
  // Still no second microphone and no Live controls in the chat itself (the frame has them).
  assert.doesNotMatch(shell,/id="liveStart"|id="voiceStopButton"|id="liveButton"/);
  assert.match(shell,/href="\.\/live\/"[^>]*>Conversar en vivo · Nuri/,'the link still works without JavaScript');
  assert.match(sheetCss,/\.live-sheet\{position:fixed;/);
});

test('opening and closing: the frame loads the Live page, closing stops the session and pulls the conversation',()=>{
  assert.match(app,/function openLiveSheet\(\)\{[\s\S]*?frame\.src='\.\/live\/\?embed=1'/);
  assert.match(app,/function closeLiveSheet\(\)\{[\s\S]*?ISABELLA_LIVE_DIAGNOSTIC\?\.stop\(\)[\s\S]*?frame\.src='about:blank'[\s\S]*?ISABELLA_SYNC_PULL_NOW\?\.\(\)/);
  assert.match(app,/\$\('#liveSheetClose'\)\.onclick=closeLiveSheet;/);
  // Only messages from the same origin and of the Live type count.
  assert.match(app,/if\(e\.origin!==location\.origin\|\|e\.data\?\.type!=='isabella-live'\)return;/);
  assert.match(app,/if\(e\.data\.event==='turn'\|\|\(e\.data\.event==='state'&&e\.data\.state==='idle'\)\)void window\.ISABELLA_SYNC_PULL_NOW\?\.\(\);/);
});

test('framed Live page: compact layout, messages only to the same origin, a turn only after a verified save',()=>{
  assert.match(page,/<script>if\(window\.self!==window\.top\)document\.documentElement\.classList\.add\('live-embedded'\)<\/script>/);
  assert.match(css,/\.live-embedded \.live-shell\{/);
  assert.match(css,/\.live-embedded \.live-header,[^{]*\{display:none\}/);
  assert.match(client,/window\.parent\.postMessage\(\{type:"isabella-live",event,\.\.\.extra\},window\.location\.origin\)/);
  assert.doesNotMatch(client,/postMessage\([^)]*,\s*["']\*["']\)/,'never to any origin');
  const write=client.slice(client.indexOf('function makeTranscript'),client.indexOf('const seenDelegations'));
  assert.ok(write.indexOf('throw Error("voice_write_failed")')<write.indexOf('notifyHost("turn")'),'only after the receipt was checked');
  assert.match(client,/if\(EMBEDDED\)reviewChat\.target="_top";/);
  assert.match(sync,/const voiceTurn=source==='isabella_live';\n\s*if\(!runtimeAssistant&&!sharedSurface&&!voiceTurn\)return;/);
});

test('in a frame, every state change reaches the chat; alone, nothing is posted',async()=>{
  const run=embedded=>{
    const posted=[],listeners={};
    const node=()=>({textContent:'',disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this['on_'+type]=fn},
      srcObject:null,muted:false,pause(){},play(){return Promise.resolve()}});
    const ids=Object.fromEntries(['liveStart','liveStop','liveAudio','liveUnlock','liveStatus','livePlayback','liveInput','liveOutput','liveVoice','liveOriginalNote',
      'liveConsult','liveMindsReview','liveMindsText','liveMindsSend','liveMindsDismiss','liveMindsStatus','liveMindsAnswer','liveMindsChat'].map(k=>[k,node()]));
    ids.liveVoice.value='nuri';
    const top={},self=embedded?{}:top;
    const window={MINDS_SUPABASE:null,MINDS_SUPABASE_CONFIG:null,self,top,location:{origin:'https://window.invalid'},
      parent:{postMessage(msg,origin){posted.push([msg,origin])}},addEventListener:(type,fn)=>{listeners[type]=fn}};
    runInNewContext(client,{document:{hidden:false,getElementById:id=>ids[id],querySelector:()=>({dataset:{}}),addEventListener(){}},window,
      navigator:{},fetch(){throw Error('unexpected')},setTimeout(){return 1},clearTimeout(){},crypto:{randomUUID:()=>'uuid'},console:{}});
    return {ids,posted};
  };
  const framed=run(true);
  assert.equal(framed.ids.liveMindsChat.target,'_top');
  framed.ids.liveStart.on_click();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(framed.posted.map(([m,o])=>[m.type,m.event,m.state,o]),
    [['isabella-live','state','connecting','https://window.invalid'],['isabella-live','state','idle','https://window.invalid']]);
  const alone=run(false);
  alone.ids.liveStart.on_click();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(alone.posted,[]);
  assert.equal(alone.ids.liveMindsChat.target,undefined);
});
