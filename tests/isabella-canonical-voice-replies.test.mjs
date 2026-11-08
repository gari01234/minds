import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const voiceSource=read('apps/isabella/voice-output.js');
const app=read('apps/isabella/app.js');
const shell=read('apps/isabella/shell.js');
const html=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');

function browser(withVoice=true){
  const events={document:{},window:{}},spoken=[];
  let cancellations=0;
  const button={
    title:'Hablar',
    attributes:{},
    setAttribute(name,value){this.attributes[name]=value},
    classList:{speaking:false,toggle(name,value){if(name==='voice-speaking')this.speaking=value}}
  };
  const document={
    hidden:false,documentElement:{lang:'es'},
    getElementById(id){return id==='micButton'?button:null},
    addEventListener(name,callback){events.document[name]=callback}
  };
  const window={
    addEventListener(name,callback){events.window[name]=callback},
    ...(withVoice?{
      speechSynthesis:{
        speak(utterance){spoken.push(utterance)},
        cancel(){cancellations++}
      },
      SpeechSynthesisUtterance:class {
        constructor(text){this.text=text}
      }
    }:{})
  };
  runInNewContext(voiceSource,{window,document,navigator:{language:'de-DE'}});
  return {voice:window.ISABELLA_VOICE_OUTPUT,document,window,spoken,events,button,
    get cancellations(){return cancellations}};
}

test('no speech at load, and speech is explicitly requested',()=>{
  const b=browser();
  assert.equal(b.voice.available(),true);
  assert.equal(b.spoken.length,0);
  assert.equal(b.button.classList.speaking,false);
  assert.equal(b.voice.speak('Hola, Gari.'),true);
  assert.equal(b.spoken.length,1);
  assert.equal(b.spoken[0].text,'Hola, Gari.');
  assert.equal(b.spoken[0].lang,'es-ES');
  assert.equal(b.button.classList.speaking,true);
  assert.equal(b.button.attributes['aria-label'],'Detener respuesta hablada');
  b.spoken[0].onend();
  assert.equal(b.button.classList.speaking,false);
  assert.equal(b.button.attributes['aria-label'],'Hablar');
});

test('speech does not read code blocks or external URL destinations',()=>{
  const b=browser();
  const text=b.voice.textForSpeech('Hola **Gari**. [Archivo](https://example.com/source) \n\n```secret\npassword\n```\n Más.');
  assert.ok(!text.includes('https://'));
  assert.ok(!text.includes('secret'));
  assert.ok(!text.includes('password'));
  assert.match(text,/Hola/);
  assert.match(text,/Archivo/);
  assert.ok(b.voice.textForSpeech('x'.repeat(1200)).length<=721);
});

test('spoken reply can always be stopped, old completion cannot clear a new one',()=>{
  const b=browser();
  b.voice.speak('Primera');
  const old=b.spoken[0];
  b.voice.speak('Segunda');
  assert.equal(b.spoken.length,2);
  old.onend();
  assert.equal(b.button.classList.speaking,true);
  b.voice.stop();
  assert.equal(b.button.classList.speaking,false);
  assert.ok(b.cancellations>=2);
});

test('visibility and navigation stop speaking; no playback in a hidden tab',()=>{
  const b=browser();
  b.voice.speak('Algo importante');
  b.events.window['isabella:before-screen-change']();
  assert.equal(b.button.classList.speaking,false);
  b.document.hidden=true;
  assert.equal(b.voice.speak('No debe sonar'),false);
  b.events.document.visibilitychange();
  assert.equal(b.button.classList.speaking,false);
  b.document.hidden=false;
  b.voice.speak('Nuevo mensaje');
  b.events.window.pagehide();
  assert.equal(b.button.classList.speaking,false);
});

test('unsupported browser remains silent without throwing',()=>{
  const b=browser(false);
  assert.equal(b.voice.available(),false);
  assert.equal(b.voice.speak('Hola'),false);
});

test('voice belongs only to the existing canonical chat turn',()=>{
  assert.match(app,/async function handle\(text,attachments=\[\],replyTo=null,options=\{\}\)/);
  assert.match(app,/voiceTurn===voiceTurnEpoch/);
  assert.match(app,/integrity\.typed&&integrity\.outcome==='answered'/);
  assert.match(app,/!result\?\.incomplete/);
  assert.match(app,/speakReply=!!speakChoice\?\.checked&&!speakChoice\.disabled/);
  assert.match(app,/handle\(text,\[\],null,\{speakReply\}\)/);
  assert.match(app,/window\.ISABELLA_VOICE_OUTPUT\?\.stop\(\)/);
  assert.doesNotMatch(voiceSource,/openai\.com|supabase\.co|fetch\(|localStorage|sessionStorage/);
  assert.match(shell,/id="focusSpeakReply" type="checkbox"/);
  assert.match(shell,/id="micButton"/);
  assert.match(shell,/id="focusLiveLink"/);
  assert.match(shell,/href="\.\/live\/"[^>]*>Conversar en vivo · Nuri/);
  assert.match(app,/\$\('#focusLiveLink'\)\.onclick=\(\)=>\{cancel\(\)/);
  assert.match(app,/fallbackRec\.lang='es-MX'/);
  assert.match(voiceSource,/voice-speaking/);
  assert.doesNotMatch(shell,/id="voiceStopButton"/);
  assert.match(app,/ISABELLA_VOICE_OUTPUT\?\.isSpeaking\(\)/);
  assert.match(voiceSource,/voice-speaking/);
});

test('PWA includes new scripts and keeps existing transcription and canonical runtime',()=>{
  for(const src of ["./voice-output.js?v=2","./app.js?v=143","./shell.js?v=110"])
    assert.ok(html.includes(src)&&sw.includes(src),src);
  assert.ok(html.includes('./voice-output.css?v=3')&&sw.includes('./voice-output.css?v=3'));
  assert.ok(html.indexOf('voice-output.js?v=2')<html.indexOf('app.js?v=143'));
  assert.match(app,/ISABELLA_AI\.transcribe\(blob\)/);
  assert.match(app,/window\.ISABELLA_AI\.ask\(/);
  assert.match(sw,/isabella-shell-v187/);
});
