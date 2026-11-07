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
  assert.match(page,/las respuestas usan el agente y permisos existentes/i);
  assert.match(shell,/id="micButton"/);
  assert.match(shell,/id="focusLiveLink"/);
  assert.doesNotMatch(shell,/id="liveStart"|id="voiceStopButton"/);
  assert.match(original,/ISABELLA_AI\.transcribe\(blob\)/);
  assert.ok(build.includes("cpSync(new URL(`apps/${app}/`,root)"));
  assert.match(css,/\.live-shell/);
  assert.match(page,/\.\/live\.js\?v=6/);
  assert.match(page,/\.\.\/\.\.\/shared\/supabase-client\.js/);
});


test('Live voice choices are exactly the documented server allowlist',()=>{
  const allOptions=[...page.matchAll(/<option value="([^"]+)"(?: selected)?>/g)].map(x=>x[1]);
  const options=allOptions.filter(x=>x!=='isabella-original-v1');
  const m=broker.match(/const LIVE_VOICES=new Set\((\[[^;]+\])\);/);
  assert.ok(m,'missing server-side voice allowlist');
  const accepted=JSON.parse(m[1]);
  assert.equal(options.length,31);
  assert.equal(allOptions.length,32);
  assert.equal(new Set(options).size,options.length);
  assert.deepEqual([...options].sort(),[...accepted].sort());
  assert.equal(options[0],'nuri');
  assert.match(page,/value="nuri" selected/);
  assert.match(page,/value="brise"/);
  assert.doesNotMatch(page,/value="brise" selected/);
  assert.match(page,/value="marin"/);
  assert.doesNotMatch(page,/value="marin" selected/);
  assert.equal((page.match(/<option value="[^"]+" selected>/g)||[]).length,1);
  assert.match(broker,/const voice=body\?\.voice===undefined\?"nuri":body\.voice/);
  assert.match(page,/value="isabella-original-v1"/);
  assert.match(page,/id="liveOriginalNote"/);
  assert.match(page,/id="liveVoice"/);
  assert.match(page,/\.\/live\.css\?v=4/);
  assert.match(broker,/typeof voice!=="string"/);
  assert.match(broker,/voice!==ORIGINAL_ALIAS/);
  assert.match(broker,/error:"invalid_voice"/);
  assert.match(broker,/audio:\{output:\{voice:voiceValue\}\}/);
  assert.match(client,/const voice=voicePicker\.value;/);
  assert.match(client,/body:JSON\.stringify\(\{sdp:connection\.localDescription\?\.sdp\|\|"",voice\}\)/);
  assert.match(client,/voicePicker\.disabled=value==="connecting"\|\|value==="active"/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|\.rpc\(|\.from\(/);
});

test('original voice requires explicit selection and uses a non-imitative fixed prompt under owner RLS',()=>{
  assert.match(broker,/const ORIGINAL_ALIAS="isabella-original-v1"/);
  assert.match(broker,/body\?\.action==="ensure_original_voice"/);
  assert.match(broker,/existingOriginalVoice\(id\.client,user\.id\)/);
  assert.match(broker,/https:\/\/api\.openai\.com\/v1\/audio\/voices/);
  assert.match(broker,/type:"prompt"/);
  assert.match(broker,/prompt:ORIGINAL_PROMPT,model:"auto"/);
  assert.doesNotMatch(broker,/script_hint:ORIGINAL_SCRIPT/);
  assert.match(broker,/original_voice_invalid_request/);
  assert.match(broker,/original_voice_access_denied/);
  assert.match(broker,/safe\(failure\?\.error\?\.code\)/);
  assert.match(broker,/Do not emulate or imitate any real individual/);
  assert.doesNotMatch(broker,/Johansson|Scarlett|Samantha|Sky|audio_sample|voice_consents/);
  assert.match(broker,/voice_id:created\.id/);
  assert.match(broker,/preference_key:ORIGINAL_PREF/);
  assert.match(broker,/\.eq\("user_id",userId\)/);
  assert.match(broker,/global:\{headers:\{Authorization:"Bearer "\+token\}\}/);
  assert.match(broker,/voiceValue=\{id:ownerVoice\}/);
  assert.match(broker,/error:"original_voice_not_ready"/);
  assert.match(client,/const ORIGINAL_VOICE="isabella-original-v1"/);
  assert.match(client,/voice===ORIGINAL_VOICE/);
  assert.match(client,/action:"ensure_original_voice"/);
  assert.match(client,/OpenAI rechazó los parámetros de creación/);
  assert.match(client,/playback\.textContent="Reproducción detenida\."/);
  assert.match(client,/if\(!created\.ok\|\|payload\?\.ready!==true\)/);
  assert.match(client,/voicePicker\.disabled=value==="connecting"\|\|value==="active"/);
  assert.doesNotMatch(client,/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|voice_id:created\.id/);
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
  assert.match(client,/La respuesta no tiene un comprobante completo y verificable/);
  assert.doesNotMatch(client,/window\.ISABELLA_AI\.ask|window\.MINDS_CHAT_STREAM_RECOVERY/);
  assert.match(client,/\/functions\/v1\/isabella-chat/);
  assert.match(client,/reviewSend\.addEventListener\("click"/);
  assert.match(client,/surface:"chat_browser",client_message_id:turn\.requestId/);
  assert.match(client,/canonical\?\.admission\?\.\(result,integrity\?\.validate,integrity\?\.summary\)/);
  assert.match(client,/No pude confirmar el resultado/);
  assert.doesNotMatch(client,/\.from\(|\.rpc\(/);
});

test('delegation requires an explicit reviewed utterance and typed MINDS receipt',()=>{
  assert.match(page,/id="liveMindsText"/);
  assert.match(page,/id="liveMindsReview" class="live-minds-review hidden"/);
  assert.match(page,/id="liveMindsSend"/);
  assert.match(page,/src="\.\/canonical\.js\?v=2"/);
  assert.match(page,/src="\.\.\/turn-integrity\.js"/);
  assert.match(client,/session\.thinking\.append/);
  assert.match(client,/if\(!showReview\(id\)\)/);
  assert.match(client,/seenDelegations\.add\(id\)/);
  assert.match(client,/if\(!active\|\|!turn\|\|turn\.busy\|\|turn\.done\|\|turn\.epoch!==epoch\)return/);
  assert.match(client,/turn\.requestId=crypto\.randomUUID\(\)/);
  assert.match(client,/reviewText\.value/);
  assert.match(client,/requestId:turn\.requestId|client_message_id:turn\.requestId/);
  assert.match(client,/No se pudo enviar al canal de audio/);
  assert.match(broker,/solicita delegación al cliente/);
  assert.match(broker,/español mexicano/);
  assert.doesNotMatch(client,/MINDS_CHAT_STREAM_RECOVERY|confirmProposals|applyProposal/);
});

test('runtime starts idle; a backend failure is visible and never starts microphone without a click',async()=>{
  const listeners={};
  const node=()=>({
    textContent:'',disabled:false,classList:{add(){},remove(){},toggle(){}},
    addEventListener(type,fn){this['on_'+type]=fn},
    srcObject:null,muted:false,
    pause(){},play(){return Promise.resolve()}
  });
  const ids=Object.fromEntries(['liveStart','liveStop','liveAudio','liveUnlock','liveStatus','livePlayback','liveInput','liveOutput','liveVoice','liveOriginalNote','liveConsult','liveMindsReview','liveMindsText','liveMindsSend','liveMindsDismiss','liveMindsStatus','liveMindsAnswer','liveMindsChat'].map(k=>[k,node()]));
  ids.liveVoice.value='nuri';
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
