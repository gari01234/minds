// GPT-Live real WebRTC audio acceptance. Intentionally no MINDS tool/memory bridge.
// The existing Isabella chat, speech-to-text flow and voice controls are untouched.
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const shell=document.querySelector(".live-shell");
  const startButton=$("liveStart"),stopButton=$("liveStop");
  const audio=$("liveAudio"),unlock=$("liveUnlock"),status=$("liveStatus");
  const playback=$("livePlayback"),input=$("liveInput"),output=$("liveOutput");
  const MAX_DURATION_MS=90000,ICE_WAIT_MS=9000;
  let peer=null,microphone=null,channel=null,timeoutId=null;
  let active=false,epoch=0,sessionReady=false,remoteTrack=false,playbackStarted=false;
  const shownError={
    auth_required:"Inicia sesión en el chat de Isabella antes de usar Live.",
    invalid_session:"La sesión ha caducado. Vuelve a iniciar sesión en Isabella.",
    live_not_configured:"Live todavía no está configurado en el servidor.",
    live_capacity_unavailable:"Live no está disponible por capacidad del proveedor.",
    live_provider_unavailable:"El proveedor no ha permitido iniciar esta sesión de voz.",
    live_connection_failed:"No fue posible conectar la sesión de audio.",
    invalid_audio_sdp:"Safari no generó una oferta WebRTC válida."
  };

  function state(value,message){
    shell.dataset.state=value;status.textContent=message;
    startButton.disabled=value==="connecting"||value==="active";
    stopButton.disabled=value!=="connecting"&&value!=="active";
  }
  function stop(message="Conversación finalizada."){
    epoch++;active=false;sessionReady=false;remoteTrack=false;playbackStarted=false;
    clearTimeout(timeoutId);timeoutId=null;
    const oldChannel=channel;channel=null;
    try{oldChannel?.close()}catch{}
    const oldPeer=peer;peer=null;
    try{oldPeer?.close()}catch{}
    const oldMic=microphone;microphone=null;
    try{oldMic?.getTracks().forEach(t=>t.stop())}catch{}
    try{audio.pause()}catch{}
    audio.srcObject=null;
    unlock.classList.add("hidden");
    state("idle",message);
  }
  function send(obj){
    if(channel?.readyState!=="open")return false;
    try{channel.send(JSON.stringify({...obj,event_id:crypto.randomUUID()}));return true}
    catch{return false}
  }
  function appendCaption(node,value){
    const delta=typeof value==="string"?value:"";
    if(!delta)return;
    const before=node.textContent==="—"?"":node.textContent;
    node.textContent=(before+delta).slice(-1800);
  }
  function handleEvent(raw,token){
    if(token!==epoch)return;
    let event;
    try{event=JSON.parse(raw)}catch{return}
    if(event?.type==="session.started"){
      sessionReady=true;
      state("active","Te escucho. Habla con naturalidad.");
    }else if(event?.type==="session.input_transcript.delta"){
      appendCaption(input,event.delta);
    }else if(event?.type==="session.output_transcript.delta"){
      appendCaption(output,event.delta);
    }else if(event?.type==="session.delegation.created"){
      // A delegation has no user utterance or complete transcript.
      // Never turn fragments into MINDS actions, and never claim task success.
      const id=event?.delegation?.id;
      if(event?.delegation?.target==="client"&&typeof id==="string"&&id.length<256){
        send({type:"session.commentary.append",delegation_id:id,
          content:"Esta es una prueba de audio. Todavía no tengo acceso a la memoria, los proyectos o las herramientas de MINDS. Para esas peticiones, utiliza el chat escrito de Isabella."});
      }
    }else if(event?.type==="session.closed"){
      stop("La sesión terminó.");
    }else if(event?.type==="error"||event?.type==="session.error"){
      state("active","El proveedor informó de un error de voz. Puedes finalizar y probar otra vez.");
    }
  }

  async function iceReady(pc){
    if(pc.iceGatheringState==="complete")return;
    await new Promise((resolve,reject)=>{
      let finished=false;
      const done=(error)=>{
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange",check);
        error?reject(error):resolve();
      };
      const check=()=>{if(pc.iceGatheringState==="complete")done()};
      const timer=setTimeout(()=>done(new Error("ice_timeout")),ICE_WAIT_MS);
      pc.addEventListener("icegatheringstatechange",check);
      check();
    });
  }
  function tryPlay(){
    if(!remoteTrack)return;
    audio.muted=false;
    const attempt=audio.play();
    if(attempt&&typeof attempt.catch==="function")attempt.catch(()=>{
      if(!active)return;
      unlock.classList.remove("hidden");
      playback.textContent="Safari bloqueó la reproducción automática. Pulsa «Activar altavoz» o el control de reproducción.";
    });
  }
  audio.addEventListener("playing",()=>{
    if(!active||!remoteTrack)return;
    playbackStarted=true;
    unlock.classList.add("hidden");
    playback.textContent="Safari ha iniciado la reproducción del audio. Confirma si lo escuchas realmente.";
  });
  audio.addEventListener("error",()=>{
    if(!active)return;
    unlock.classList.remove("hidden");
    playback.textContent="No se pudo reproducir el audio remoto. Prueba «Activar altavoz».";
  });
  unlock.addEventListener("click",tryPlay);

  async function start(){
    if(active||peer)return;
    const token=++epoch;
    active=true;sessionReady=false;remoteTrack=false;playbackStarted=false;
    input.textContent="—";output.textContent="—";
    playback.textContent="Esperando audio remoto…";
    unlock.classList.add("hidden");
    state("connecting","Conectando el micrófono…");
    timeoutId=setTimeout(()=>stop("Tiempo de prueba agotado (90 segundos)."),MAX_DURATION_MS);
    try{
      const sb=window.MINDS_SUPABASE,cfg=window.MINDS_SUPABASE_CONFIG;
      if(!sb||!cfg?.url||!cfg.publishableKey)throw new Error("No hay conexión con MINDS.");
      const {data:{session},error}=await sb.auth.getSession();
      if(error||!session?.access_token)throw new Error("Inicia sesión primero en el chat de Isabella.");
      if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error("Este navegador no admite la conexión de audio necesaria.");
      if(token!==epoch)return;

      microphone=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
      });
      if(token!==epoch){microphone?.getTracks().forEach(t=>t.stop());return}
      const connection=new RTCPeerConnection();
      peer=connection;
      connection.addEventListener("track",event=>{
        if(token!==epoch||event.track.kind!=="audio")return;
        remoteTrack=true;
        audio.srcObject=new MediaStream([event.track]);
        tryPlay();
      });
      connection.addEventListener("connectionstatechange",()=>{
        if(token===epoch&&connection.connectionState==="failed")stop("La conexión de voz se interrumpió.");
      });
      microphone.getAudioTracks().forEach(track=>connection.addTrack(track,microphone));
      channel=connection.createDataChannel("oai-events");
      channel.addEventListener("message",e=>handleEvent(e.data,token));
      channel.addEventListener("close",()=>{
        if(token===epoch&&active)stop("El canal de voz se cerró.");
      });
      const offer=await connection.createOffer();
      await connection.setLocalDescription(offer);
      await iceReady(connection);
      if(token!==epoch)return;

      state("connecting","Abriendo sesión GPT‑Live…");
      const response=await fetch(cfg.url+"/functions/v1/isabella-live-session",{
        method:"POST",
        headers:{
          apikey:cfg.publishableKey,
          Authorization:"Bearer "+session.access_token,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({sdp:connection.localDescription?.sdp||""})
      });
      const result=await response.json().catch(()=>null);
      if(token!==epoch)return;
      if(!response.ok)throw new Error(shownError[result?.error]||"El servidor rechazó la sesión de Live.");
      if(result?.transport?.type!=="webrtc"||typeof result.transport.sdp!=="string"||
         result.transport.sdp.length<50||!result.transport.sdp.startsWith("v=0")){
        throw new Error("La respuesta WebRTC no es válida.");
      }
      await connection.setRemoteDescription({type:"answer",sdp:result.transport.sdp});
      if(token!==epoch)return;
      state("active","Conectando el altavoz…");
    }catch(error){
      if(token!==epoch)return;
      const name=error instanceof Error?error.message:"unknown";
      const label=name==="ice_timeout"?"Safari no pudo negociar el canal de audio.":name;
      stop(label||"No se pudo iniciar Live.");
    }
  }
  startButton.addEventListener("click",()=>void start());
  stopButton.addEventListener("click",()=>stop());
  window.addEventListener("pagehide",()=>stop());
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden&&active)stop("Sesión detenida al salir de la pantalla.");
  });
  window.ISABELLA_LIVE_DIAGNOSTIC=Object.freeze({
    getState:()=>({active,sessionReady,remoteTrack,playbackStarted}),
    stop
  });
})();
