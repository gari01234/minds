import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const contractCode=read('apps/isabella/turn-integrity.js');
const gateCode=read('apps/isabella/live/canonical.js');
const clientCode=read('apps/isabella/live/live.js');

function makeGate(){
  const window={};
  runInNewContext(contractCode,{window});
  runInNewContext(gateCode,{window});
  const integrity=window.MINDS_TURN_INTEGRITY,gate=window.ISABELLA_LIVE_CANONICAL;
  return {integrity,gate,decide:r=>gate.admission(r,integrity.validate,integrity.summary)};
}
const answered=reply=>({reply,outcome:{outcome:'answered',proposal_count:0,applied_count:0},
  proposal:null,proposals:[],action_receipts:[]});

test('Only typed verified answers can be spoken, with source URLs stripped',()=>{
  const {decide}=makeGate();
  const ok=decide(answered('Tu cita es el martes. [Fuente](https://example.org/a) https://example.com.'));
  assert.equal(ok.ok,true);
  assert.equal(ok.outcome,'answered');
  assert.match(ok.spoken,/Tu cita es el martes/);
  assert.doesNotMatch(ok.spoken,/https:/);
  assert.equal(decide({reply:'Prometo hacerlo'}).ok,false);
  assert.equal(decide({...answered('texto'),incomplete:true}).ok,false);
  assert.equal(decide({...answered('texto'),error:'provider_error'}).ok,false);
  assert.equal(decide({...answered('texto'),outcome:{outcome:'answered',proposal_count:1,applied_count:0}}).ok,false);
});

test('Proposals are pending; never voiced as completed actions',()=>{
  const {decide}=makeGate();
  const p={request_id:'proposal-1',kind:'task',action:'create',title:'Enviar informe'};
  const result={reply:'Ya guardé tu tarea',proposal:p,proposals:[],
    outcome:{outcome:'proposal_created',proposal_count:1,applied_count:0}};
  const admission=decide(result);
  assert.equal(admission.ok,true);
  assert.equal(admission.hasReview,true);
  assert.match(admission.spoken,/No he aplicado ningún cambio/);
  assert.doesNotMatch(admission.spoken,/Ya guardé/);
  assert.equal(decide({...result,proposal:{...p,request_id:''}}).ok,false);
});

test('Action completion requires exact canonical receipts',()=>{
  const {decide}=makeGate();
  const result={reply:'Se modificó la agenda',proposal:null,proposals:[],
    outcome:{outcome:'action_applied',proposal_count:0,applied_count:1},
    action_receipts:[{receipt_id:'receipt-1',request_id:'request-1'}]};
  assert.match(decide(result).spoken,/Listo/);
  assert.equal(decide({...result,action_receipts:[]}).ok,false);
  assert.equal(decide({...result,action_receipts:[{receipt_id:'',request_id:'request-1'}]}).ok,false);
});

test('Clarification must match a verified source receipt',()=>{
  const {decide}=makeGate(),reply='¿El viernes o el sábado?';
  const r={reply,outcome:{outcome:'needs_clarification',proposal_count:0,applied_count:0},
    pending_clarification:{version:1,source_turn_id:'s',receipt_id:'r',question:reply}};
  assert.equal(decide(r).spoken,reply);
  assert.equal(decide({...r,pending_clarification:{...r.pending_clarification,question:'otra pregunta'}}).ok,false);
});

test('Capturing voice and receiving delegation never calls canonical backend without owner review',async()=>{
  const {integrity,gate}=makeGate();
  const nodes=new Map(),calls=[],sent=[],events={},listeners={};
  const mediaStops=[];
  function node(){
    const handlers={},flags=new Set(['hidden']);
    return {
      textContent:'',value:'',disabled:false,muted:false,srcObject:null,
      classList:{add:k=>flags.add(k),remove:k=>flags.delete(k),
        toggle:(k,on)=>on?flags.add(k):flags.delete(k),contains:k=>flags.has(k)},
      addEventListener:(kind,fn)=>{handlers[kind]=fn},
      emit:(kind,arg)=>handlers[kind]?.(arg),
      pause(){},play(){return Promise.resolve()}
    };
  }
  for(const id of ['liveStart','liveStop','liveVoice','liveAudio','liveUnlock',
    'liveStatus','livePlayback','liveInput','liveOutput','liveConsult',
    'liveMindsReview','liveMindsText','liveMindsSend','liveMindsDismiss',
    'liveMindsStatus','liveMindsAnswer','liveMindsChat','liveOriginalNote']){
    nodes.set(id,node());
  }
  nodes.get('liveVoice').value='brise';
  const doc={hidden:false,querySelector:()=>({dataset:{}}),
    getElementById:id=>nodes.get(id),
    addEventListener:(kind,fn)=>{listeners['doc_'+kind]=fn}};
  class Peer {
    constructor(){this.iceGatheringState='complete';this.connectionState='connected';this.localDescription=null}
    addEventListener(){}
    addTrack(){}
    createDataChannel(){return {readyState:'open',
      addEventListener:(kind,fn)=>{events[kind]=fn},
      send:data=>sent.push(JSON.parse(data)),close(){}}}
    async createOffer(){return {type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n'}}
    async setLocalDescription(o){this.localDescription=o}
    async setRemoteDescription(){}
    close(){}
  }
  const win={
    MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{access_token:'valid-jwt'}},error:null})}},
    MINDS_SUPABASE_CONFIG:{url:'https://example.supabase.co',publishableKey:'pub-key'},
    ISABELLA_LIVE_CANONICAL:gate,MINDS_TURN_INTEGRITY:integrity,RTCPeerConnection:Peer,
    addEventListener:(kind,fn)=>{listeners[kind]=fn}
  };
  let nonce=0;
  runInNewContext(clientCode,{
    document:doc,window:win,RTCPeerConnection:Peer,
    navigator:{language:'es-MX',mediaDevices:{getUserMedia:async()=>({
      getTracks:()=>[{stop:()=>mediaStops.push(1)}],
      getAudioTracks:()=>[{stop:()=>mediaStops.push(1)}]
    })}},
    crypto:{randomUUID:()=> 'id-'+(++nonce)},MediaStream:class{},
    setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/isabella-live-session'))return {ok:true,status:201,
        json:async()=>({transport:{type:'webrtc',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n'}})};
      if(url.endsWith('/isabella-chat'))return {ok:true,status:200,
        json:async()=>answered('Según MINDS, tienes dos tareas pendientes hoy.')};
      throw Error('unexpected endpoint');
    },
    console:{},Intl,Date,Error,JSON,Promise
  });
  assert.equal(calls.length,0);
  nodes.get('liveStart').emit('click');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.length,1,'WebRTC not started: '+nodes.get('liveStatus').textContent);
  assert.equal(nodes.get('liveStatus').textContent,'Conectando el altavoz…');
  events.message({data:JSON.stringify({type:'session.input_transcript.delta',delta:'¿Qué tareas tengo hoy?'})});
  assert.equal(calls.length,1,'transcript alone does not call MINDS');
  events.message({data:JSON.stringify({type:'session.delegation.created',
    delegation:{target:'client',id:'item_12345'},offset_ms:1000})});
  assert.equal(calls.length,1,'delegation alone does not call MINDS');
  assert.equal(nodes.get('liveMindsReview').classList.contains('hidden'),false);
  assert.equal(nodes.get('liveMindsText').value,'¿Qué tareas tengo hoy?');
  assert.ok(sent.some(e=>e.type==='session.thinking.append'&&e.delegation_id==='item_12345'));
  nodes.get('liveMindsText').value='¿Qué tareas tengo mañana?';
  nodes.get('liveMindsText').emit('input');
  nodes.get('liveMindsSend').emit('click');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.length,2,'one canonical request');
  const request=JSON.parse(calls[1].options.body);
  assert.equal(request.message,'¿Qué tareas tengo mañana?');
  assert.equal(request.surface,'chat_browser');
  assert.equal(request.context.locale,'es-MX');
  assert.equal(request.client_message_id,'id-2');
  assert.equal(nodes.get('liveMindsSend').disabled,true);
  assert.ok(sent.some(e=>e.type==='session.commentary.append'&&e.delegation_id==='item_12345'&&/dos tareas pendientes/.test(e.content)));
  nodes.get('liveMindsSend').emit('click');
  await Promise.resolve();
  assert.equal(calls.length,2,'no duplicate request');
  events.message({data:JSON.stringify({type:'session.input_transcript.delta',delta:'¿Qué sigue?'})});
  assert.equal(nodes.get('liveInput').textContent,'¿Qué sigue?');
  assert.equal(nodes.get('liveConsult').classList.contains('hidden'),false);
  nodes.get('liveConsult').emit('click');
  assert.equal(nodes.get('liveMindsText').value,'¿Qué sigue?');
  assert.equal(calls.length,2,'follow-up is not sent without another explicit confirmation');
  listeners.pagehide();
  assert.ok(mediaStops.length>0);
});
