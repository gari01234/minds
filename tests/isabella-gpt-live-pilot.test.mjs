import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=read('apps/isabella/live/index.html');
const client=read('apps/isabella/live/live.js');
const css=read('apps/isabella/live/live.css');
const broker=read('supabase/functions/isabella-live-session/index.ts');
const config=read('supabase/config.toml');
const build=read('scripts/build.mjs');
const original=read('apps/isabella/app.js');
const shell=read('apps/isabella/shell.js');

test('Live is a separate user-initiated surface, not another microphone in canonical chat',()=>{
  assert.match(page,/id="liveStart"/);
  assert.match(page,/id="liveStop"[^>]*disabled/);
  assert.match(page,/id="liveAudio"[^>]*autoplay[^>]*playsinline[^>]*controls/);
  assert.match(page,/id="liveUnlock"[^>]*hidden/);
  assert.match(page,/no guarda esta conversación en MINDS/);
  assert.match(shell,/id="micButton"/);
  assert.doesNotMatch(shell,/id="liveStart"|id="voiceStopButton"/);
  assert.match(original,/ISABELLA_AI\.transcribe\(blob\)/);
  assert.ok(build.includes("cpSync(new URL(`apps/${app}/`,root)"));
  assert.match(css,/\.live-shell/);
  assert.match(page,/\.\/live\.js\?v=1/);
  assert.match(page,/\.\.\/\.\.\/shared\/supabase-client\.js/);
});

test('broker authenticates owner, hides credentials, rejects oversized SDP and forbids privileged tools',()=>{
  assert.match(config,/\[functions\.isabella-live-session\]\s*verify_jwt = true/);
  assert.match(broker,/auth\.getUser\(id\.token\)/);
  assert.match(broker,/Origin/);
  assert.match(broker,/MAX_SDP=56\*1024/);
  assert.match(broker,/\bstore:false\b|store:false/);
  assert.match(broker,/delegation:\{type:"client"/);
  assert.match(broker,/model:"gpt-live-1"/);
  assert.match(broker,/https:\/\/api\.openai\.com\/v1\/live\/sessions/);
  assert.match(broker,/typeof answer!=="string"/);
  assert.doesNotMatch(broker,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
  assert.doesNotMatch(client,/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|\bservice_role\b/);
  assert.doesNotMatch(client,/minds_commit_|confirmProposals|create_task|applyProposal|localStorage|sessionStorage/);
});

test('browser starts a session only on an explicit gesture and hard-stops at 90 seconds',()=>{
  assert.match(client,/startButton\.addEventListener\("click"/);
  assert.match(client,/MAX_DURATION_MS=90000/);
  assert.match(client,/await navigator\.mediaDevices\.getUserMedia/);
  assert.match(client,/new RTCPeerConnection\(\)/);
  assert.match(client,/createDataChannel\("oai-events"\)/);
  assert.match(client,/await connection\.createOffer\(\)/);
  assert.match(client,/await connection\.setRemoteDescription/);
  assert.match(client,/audio\.srcObject=new MediaStream\(\[event\.track\]\)/);
  assert.match(client,/audio\.addEventListener\("playing"/);
  assert.match(client,/audio\.play\(\)/);
  assert.match(client,/unlock\.addEventListener\("click",tryPlay\)/);
  assert.match(client,/window\.addEventListener\("pagehide"/);
  assert.match(client,/document\.addEventListener\("visibilitychange"/);
  assert.match(client,/getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);
});

test('no transcript fragment or delegated event may run MINDS writes',()=>{
  assert.match(client,/session\.input_transcript\.delta/);
  assert.match(client,/session\.delegation\.created/);
  assert.match(client,/session\.commentary\.append/);
  assert.match(client,/No tengo acceso|Todavía no tengo acceso/);
  assert.doesNotMatch(client,/window\.ISABELLA_AI\.ask|window\.MINDS_CHAT_STREAM_RECOVERY/);
  assert.doesNotMatch(client,/\.from\(|\.rpc\(|\/functions\/v1\/isabella-chat/);
});

test('runtime starts idle; a backend failure is visible and never starts microphone without a click',async()=>{
  const listeners={};
  const node=()=>({
    textContent:'',disabled:false,classList:{add(){},remove(){}},
    addEventListener(type,fn){this['on_'+type]=fn},
    srcObject:null,muted:false,
    pause(){},play(){return Promise.resolve()}
  });
  const ids=Object.fromEntries(['liveStart','liveStop','liveAudio','liveUnlock','liveStatus','livePlayback','liveInput','liveOutput'].map(k=>[k,node()]));
  const shell={dataset:{}};
  const document={hidden:false,
    getElementById:id=>ids[id],
    querySelector:()=>shell,
    addEventListener:(type,fn)=>{listeners['doc_'+type]=fn}};
  const window={MINDS_SUPABASE:null,MINDS_SUPABASE_CONFIG:null,
    addEventListener:(type,fn)=>{listeners[type]=fn}};
  let fetched=0,microphone=0;
  const consoleMock={};
  runInNewContext(client,{
    document,window,navigator:{mediaDevices:{getUserMedia(){microphone++;throw Error('unexpected')}}},
    fetch(){fetched++;throw Error('unexpected')},
    setTimeout(){return 1},clearTimeout(){},crypto:{randomUUID:()=> 'uuid'},
    RTCPeerConnection:function(){throw Error('unexpected')},
    MediaStream:function(){throw Error('unexpected')},
    console:consoleMock
  });
  assert.equal(ids.liveStatus.textContent,'');
  assert.equal(fetched,0);
  assert.equal(microphone,0);
  ids.liveStart.on_click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(fetched,0);
  assert.equal(microphone,0);
  assert.match(ids.liveStatus.textContent,/No hay conexión con MINDS/);
  assert.equal(shell.dataset.state,'idle');
  listeners.pagehide();
  assert.equal(shell.dataset.state,'idle');
});
