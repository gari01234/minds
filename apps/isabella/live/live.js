// GPT-Live real WebRTC audio with reviewed canonical MINDS delegation.
// All facts, memory, actions and receipts remain in the existing isabella-chat runtime.
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const shell=document.querySelector(".live-shell");
  const startButton=$("liveStart"),stopButton=$("liveStop"),voicePicker=$("liveVoice");
  const audio=$("liveAudio"),unlock=$("liveUnlock"),status=$("liveStatus");
  const playback=$("livePlayback"),input=$("liveInput"),output=$("liveOutput");
  const consult=$("liveConsult"),review=$("liveMindsReview");
  const reviewText=$("liveMindsText"),reviewSend=$("liveMindsSend");
  const reviewDismiss=$("liveMindsDismiss"),reviewStatus=$("liveMindsStatus");
  const reviewAnswer=$("liveMindsAnswer"),reviewChat=$("liveMindsChat");
  const canonical=window.ISABELLA_LIVE_CANONICAL,integrity=window.MINDS_TURN_INTEGRITY;
  const MAX_DURATION_MS=90000,ICE_WAIT_MS=9000;
  const OFFICE_LIVE=window.APP_PROFILE==='office';
  const lv=(spanish,german)=>OFFICE_LIVE?german:spanish;
  const ORIGINAL_VOICE="isabella-original-v1";
  const originalNote=$("liveOriginalNote");
  const updateVoiceHint=()=>originalNote.classList.toggle("hidden",voicePicker.value!==ORIGINAL_VOICE);
  voicePicker.addEventListener("change",updateVoiceHint);
  updateVoiceHint();
  let peer=null,microphone=null,channel=null,timeoutId=null;
  let active=false,epoch=0,sessionReady=false,remoteTrack=false,playbackStarted=false;
  let reviewTurn=null,reviewEdited=false;
  const manualReview=$("liveManualReview");
  let transcript=null,conversationId=null,delegatedText="",waitingDelegation=null,delegationTimer=null;
  function makeTranscript(auth,conversation){
    return window.ISABELLA_LIVE_TRANSCRIPT.turns({id:()=>crypto.randomUUID(),write:async turn=>{
      // Office speech is a client-authored transcript; a model's unverified
      // voice output must never be inserted as a canonical agent reply.
      if(OFFICE_LIVE&&turn.author==='isabella')return;
      const response=await fetch(auth.url+"/functions/v1/isabella-live-session",{method:"POST",keepalive:true,
        headers:{apikey:auth.key,Authorization:"Bearer "+auth.token,"Content-Type":"application/json"},
        body:JSON.stringify({action:"save_transcript",conversation_id:conversation,...turn})});
      const receipt=await response.json();
      if(!response.ok||receipt.saved!==true||receipt.turn_id!==turn.turn_id)throw Error("voice_write_failed");
    },onError:()=>{status.textContent=lv("Quedó una transcripción sin comprobar. Revisa el chat.","Eine Sprachtranskription konnte nicht bestätigt werden. Bitte im Chat prüfen.")}});
  }
  const seenDelegations=new Set();
  const shownError={
    auth_required:lv("Inicia sesión en el chat de Isabella antes de usar Live.","Bitte zuerst im TBA Office anmelden."),
    invalid_session:lv("La sesión ha caducado. Vuelve a iniciar sesión en Isabella.","Die Anmeldung ist abgelaufen. Bitte erneut im Office anmelden."),
    live_not_configured:lv("Live todavía no está configurado en el servidor.","Live ist im Office noch nicht konfiguriert."),
    live_capacity_unavailable:lv("Live no está disponible por capacidad del proveedor.","Der Sprachdienst ist derzeit ausgelastet."),
    live_provider_unavailable:lv("El proveedor no ha permitido iniciar esta sesión de voz.","Der Sprachdienst hat die Sitzung abgelehnt."),
    live_connection_failed:lv("No fue posible conectar la sesión de audio.","Die Audioverbindung konnte nicht hergestellt werden."),
    invalid_audio_sdp:lv("Safari no generó una oferta WebRTC válida.","Der Browser konnte keine gültige WebRTC-Verbindung vorbereiten."),
    original_voice_provider_unavailable:"La creación de la voz no se completó. Las voces existentes siguen disponibles.",
    original_voice_invalid_request:"OpenAI rechazó los parámetros de creación. Es un error técnico HTTP 400, no una confirmación de que la voz esté prohibida.",
    original_voice_access_denied:"La API rechazó el acceso para crear voces. Comprueba los permisos del proyecto OpenAI.",
    original_voice_invalid_response:"OpenAI no devolvió una voz utilizable.",
    original_voice_save_failed:"La voz se creó, pero no pude guardarla en MINDS. No la utilizaré sin un identificador verificado.",
    original_voice_unavailable:"No pude recuperar la voz original desde tu sesión de MINDS.",
    original_voice_not_ready:"La voz original todavía no está preparada."
  };

  function state(value,message){
    shell.dataset.state=value;status.textContent=message;
    startButton.disabled=value==="connecting"||value==="active";
    stopButton.disabled=value!=="connecting"&&value!=="active";
    voicePicker.disabled=value==="connecting"||value==="active";
  }
  function stop(message=lv("Conversación finalizada.","Gespräch beendet.")){
    if(reviewTurn?.busy){
      message=lv("La consulta ya se envió a MINDS y puede continuar. Comprueba el chat antes de repetirla.","Die Anfrage wurde bereits an Romy gesendet. Vor einer Wiederholung bitte den Chat prüfen.");
    }
    clearTimeout(delegationTimer);waitingDelegation=null;
    if(transcript)void transcript.finish();
    transcript=null;conversationId=null;delegatedText="";
    epoch++;active=false;sessionReady=false;remoteTrack=false;playbackStarted=false;
    reviewTurn=null;reviewEdited=false;
    review.classList.add("hidden");consult.classList.add("hidden");
    clearTimeout(timeoutId);timeoutId=null;
    const oldChannel=channel;channel=null;
    try{oldChannel?.close()}catch{}
    const oldPeer=peer;peer=null;
    try{oldPeer?.close()}catch{}
    const oldMic=microphone;microphone=null;
    try{oldMic?.getTracks().forEach(t=>t.stop())}catch{}
    try{audio.pause()}catch{}
    audio.srcObject=null;
    playback.textContent="Reproducción detenida.";
    unlock.classList.add("hidden");
    state("idle",message);
  }
  function send(obj){
    if(channel?.readyState!=="open")return false;
    try{channel.send(JSON.stringify({...obj,event_id:crypto.randomUUID()}));return true}
    catch{return false}
  }
  function showReview(delegationId=null){
    if(!active)return false;
    if(reviewTurn?.busy||reviewTurn&&!reviewTurn.done)return false;
    const draft=(delegationId?delegatedText:(input.textContent==="—"?"":input.textContent)).trim().slice(0,2000);
    reviewTurn={delegationId,epoch,requestId:null,busy:false,done:false};
    reviewEdited=false;reviewText.value=draft;
    review.classList.remove("hidden");
    reviewAnswer.textContent="";reviewAnswer.classList.add("hidden");
    reviewChat.classList.add("hidden");reviewChat.href="../";
    reviewChat.textContent=lv("Abrir chat de Isabella para revisar el resultado","Romy-Chat zur Prüfung öffnen");
    reviewStatus.textContent=lv("Revisa y corrige la transcripción. Nada se enviará sin pulsar Consultar MINDS.","Bitte die Transkription prüfen. Ohne Bestätigung wird nichts gesendet.");
    reviewSend.disabled=false;reviewDismiss.disabled=false;
    consult.classList.add("hidden");
    return true;
  }

  async function sendToCanonical(){
    const turn=reviewTurn;
    if(!active||!turn||turn.busy||turn.done||turn.epoch!==epoch)return;
    const message=String(reviewText.value||"").trim();
    if(!message||message.length>2000){
      reviewStatus.textContent=lv("Comprueba la frase: debe tener entre 1 y 2000 caracteres.","Bitte einen Text zwischen 1 und 2000 Zeichen eingeben.");
      return;
    }
    turn.busy=true;turn.requestId=crypto.randomUUID();
    reviewSend.disabled=true;reviewDismiss.disabled=true;
    reviewStatus.textContent=lv("Consultando a Isabella en MINDS…","Romy wird gefragt …");
    const token=epoch;
    try{
      const sb=window.MINDS_SUPABASE,cfg=window.MINDS_SUPABASE_CONFIG;
      if(!sb||!cfg?.url||!cfg.publishableKey)throw Error("MINDS no está disponible.");
      const {data:{session},error}=await sb.auth.getSession();
      if(error||!session?.access_token)throw Error("Tu sesión MINDS ha caducado.");
      if(token!==epoch||turn!==reviewTurn)return;
      // Use the *same* canonical tool-capable and source-first backend as the text chat.
      // Never infer read-only authority or replay an ambiguous transport failure.
      const response=await fetch(cfg.url+"/functions/v1/isabella-chat",{
        method:"POST",
        headers:{apikey:cfg.publishableKey,Authorization:"Bearer "+session.access_token,
          "Content-Type":"application/json"},
        body:JSON.stringify({message,context:{
          locale:navigator.language||"es-MX",
          timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Europe/Berlin",
          recent_local_conversation:[],
          preferences:{}
        },background:false,attachments:[],stream:false,
          surface:"chat_browser",client_message_id:turn.requestId,voice_delegation:true,voice_conversation_id:conversationId})
      });
      const result=await response.json().catch(()=>null);
      if(token!==epoch||turn!==reviewTurn)return;
      if(!response.ok||result?.error){
        reviewStatus.textContent=String(result?.message||lv("No pude confirmar el resultado. Revisa el chat antes de repetir la petición.","Das Ergebnis ist nicht bestätigt. Vor einer Wiederholung bitte den Chat prüfen.")).slice(0,240);
        reviewChat.classList.remove("hidden");turn.done=true;return;
      }
      const outcome=canonical?.admission?.(result,integrity?.validate,integrity?.summary);
      if(!outcome?.ok){
        reviewStatus.textContent=lv("La respuesta no tiene un comprobante completo y verificable. No la enviaré a la voz.","Es liegt kein vollständiger Prüfbeleg vor. Die Antwort wird nicht vorgelesen.");
        reviewChat.classList.remove("hidden");turn.done=true;return;
      }
      // The visible UI must obey the same verified receipts as speech.
      // Do not display raw model prose claiming an unapproved change is done.
      reviewAnswer.textContent=["proposal_created","action_applied","failed"].includes(outcome.outcome)
        ?outcome.spoken:outcome.reply.slice(0,5200);
      reviewAnswer.classList.remove("hidden");
      reviewChat.classList.remove("hidden");
      if(outcome.hasReview){
        // The primary Isabella app already owns owner-scoped proposal review.
        // Do not invent an approval endpoint or transfer approval authority to Live.
        const proposed=result.proposal!=null?[result.proposal]:
          Array.isArray(result.proposals)?result.proposals:[];
        const specificReview=canonical?.reviewLink?.(result,window.location.href);
        reviewChat.textContent=specificReview
          ?lv("Revisar propuesta en Isabella","Vorschlag im Romy-Chat prüfen"):lv("Revisar propuestas en Isabella","Vorschläge im Romy-Chat prüfen");
        if(specificReview)reviewChat.href=specificReview;
      }
      reviewStatus.textContent=outcome.hasReview
        ?lv("MINDS preparó una propuesta pendiente de revisión; no se ha aplicado.","Romy hat einen Vorschlag vorbereitet. Er ist noch nicht ausgeführt.")
        :outcome.outcome==="action_applied"
          ?lv("MINDS confirmó la acción con comprobantes válidos.","Die Aktion wurde mit gültigem Ausführungsbeleg bestätigt.")
          :lv("Respuesta de Isabella confirmada por MINDS.","Die Antwort von Romy wurde bestätigt.");
      // A verified canonical result can be paraphrased by GPT-Live; a transcript
      // fragment, inferred intent or model claim never becomes an action receipt.
      if(!send({type:"session.commentary.append",
        delegation_id:turn.delegationId||null,content:outcome.spoken})){
        reviewStatus.textContent+=lv(" No se pudo enviar al canal de audio; consulta la respuesta escrita."," Die Sprachausgabe ist fehlgeschlagen; bitte die schriftliche Antwort prüfen.");
      }
      turn.done=true;input.textContent="—";
    }catch{
      if(token!==epoch||turn!==reviewTurn)return;
      // The request may already have reached the backend. Do NOT retry it.
      reviewStatus.textContent=lv("No pude confirmar el resultado. MINDS podría haber recibido la petición. Comprueba el chat antes de volver a intentarlo.","Das Ergebnis konnte nicht bestätigt werden. Die Anfrage könnte bereits angekommen sein. Bitte zuerst den Chat prüfen.");
      reviewChat.classList.remove("hidden");turn.done=true;
    }finally{
      if(token===epoch&&turn===reviewTurn){
        turn.busy=false;
        reviewSend.disabled=true;reviewDismiss.disabled=false;
      }
    }
  }
  reviewText.addEventListener("input",()=>{reviewEdited=true});
  reviewSend.addEventListener("click",()=>void sendToCanonical());
  reviewDismiss.addEventListener("click",()=>{
    if(reviewTurn?.busy)return;
    reviewTurn=null;review.classList.add("hidden");
    consult.classList.toggle("hidden",!active||input.textContent==="—");
  });
  consult.addEventListener("click",()=>showReview(null));

  function appendCaption(node,value){
    const delta=typeof value==="string"?value:"";
    if(!delta)return;
    const before=node.textContent==="—"?"":node.textContent;
    node.textContent=(before+delta).slice(-1800);
  }
  function tryDelegation(){
    const waiting=waitingDelegation;
    if(!waiting)return;
    const owner=transcript?.ownerAt(waiting.offset);
    if(!owner){
      clearTimeout(delegationTimer);
      delegationTimer=setTimeout(()=>{
        if(waitingDelegation!==waiting)return;
        waitingDelegation=null;
        send({type:"session.commentary.append",delegation_id:waiting.id,content:lv("No recibí una frase completa. ¿Me la repites?","Ich habe keinen vollständigen Satz gehört. Bitte wiederholen.")});
      },1800);
      return;
    }
    clearTimeout(delegationTimer);waitingDelegation=null;
    const id=waiting.id;delegatedText=owner.text;
    if(!showReview(id)){
      send({type:"session.commentary.append",delegation_id:id,content:lv("Hay otra consulta en curso.","Eine andere Anfrage läuft bereits.")});return;
    }
    if(manualReview?.checked)reviewStatus.textContent=lv("Confirma o corrige el texto antes de enviarlo.","Bitte den Text vor dem Senden prüfen oder korrigieren.");
    else void sendToCanonical();
  }
  function handleEvent(raw,token){
    if(token!==epoch)return;
    let event;
    try{event=JSON.parse(raw)}catch{return}
    if(event?.type==="session.started"){
      sessionReady=true;
      state("active",lv("Te escucho. Habla con naturalidad.","Ich höre zu. Bitte sprich ganz normal."));
    }else if(event?.type==="session.input_transcript.delta"){
      // A completed review belongs to the previous turn. Never merge its
      // transcript into a subsequent utterance or hide manual consultation.
      if(reviewTurn?.done){
        reviewTurn=null;reviewEdited=false;
        review.classList.add("hidden");
        input.textContent="—";
      }
      const part=transcript?.add("gari",event);
      if(part?.author==="gari")input.textContent=part.text;else appendCaption(input,event.delta);
      if(reviewTurn&&!reviewTurn.busy&&!reviewTurn.done&&!reviewEdited){
        reviewText.value=String(input.textContent==="—"?"":input.textContent).slice(0,2000);
      }
      if(!reviewTurn&&input.textContent!=="—")consult.classList.remove("hidden");
      if(waitingDelegation){clearTimeout(delegationTimer);delegationTimer=setTimeout(tryDelegation,250)}
    }else if(event?.type==="session.output_transcript.delta"){
      const part=transcript?.add("isabella",event);
      if(part?.author==="isabella")output.textContent=part.text;else appendCaption(output,event.delta);
    }else if(event?.type==="session.delegation.created"){
      // Delegation metadata does not contain the user's utterance. Its text
      // must be reviewed by the owner before invoking the existing MINDS backend.
      const id=event?.delegation?.id;
      if(event?.delegation?.target==="client"&&typeof id==="string"&&
         /^[A-Za-z0-9_-]{5,200}$/.test(id)&&!seenDelegations.has(id)){
        seenDelegations.add(id);
        // Suppress speculative spoken progress, then wait for reviewed input.
        send({type:"session.thinking.append",delegation_id:id,content:""});
        waitingDelegation={id,offset:event.offset_ms};
        tryDelegation();

      }
    }else if(event?.type==="session.closed"){
      stop(lv("La sesión terminó.","Die Sitzung wurde beendet."));
    }else if(event?.type==="error"||event?.type==="session.error"){
      state("active",lv("El proveedor informó de un error de voz. Puedes finalizar y probar otra vez.","Beim Sprachdienst ist ein Fehler aufgetreten. Bitte die Sitzung beenden."));
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
      playback.textContent=lv("Safari bloqueó la reproducción automática. Pulsa «Activar altavoz» o el control de reproducción.","Die automatische Wiedergabe wurde blockiert. Bitte »Lautsprecher aktivieren« wählen.");
    });
  }
  audio.addEventListener("playing",()=>{
    if(!active||!remoteTrack)return;
    playbackStarted=true;
    unlock.classList.add("hidden");
    playback.textContent=lv("Safari ha iniciado la reproducción del audio. Confirma si lo escuchas realmente.","Die Audioausgabe wurde gestartet. Bitte prüfen, ob Ton zu hören ist.");
  });
  audio.addEventListener("error",()=>{
    if(!active)return;
    unlock.classList.remove("hidden");
    playback.textContent=lv("No se pudo reproducir el audio remoto. Prueba «Activar altavoz».","Die Audioausgabe funktioniert nicht. Bitte »Lautsprecher aktivieren« versuchen.");
  });
  unlock.addEventListener("click",tryPlay);

  async function start(){
    if(active||peer)return;
    // Capture the selected voice once; GPT-Live voices are immutable per session.
    const voice=voicePicker.value;
    const token=++epoch;
    active=true;sessionReady=false;remoteTrack=false;playbackStarted=false;
    input.textContent="—";output.textContent="—";
    reviewTurn=null;reviewEdited=false;seenDelegations.clear();
    review.classList.add("hidden");consult.classList.add("hidden");
    playback.textContent=lv("Esperando audio remoto…","Warte auf die Audioantwort …");
    unlock.classList.add("hidden");
    state("connecting",lv("Conectando el micrófono…","Mikrofon wird verbunden …"));
    timeoutId=setTimeout(()=>stop(lv("Tiempo de prueba agotado (90 segundos).","Die 90 Sekunden sind abgelaufen.")),MAX_DURATION_MS);
    try{
      const sb=window.MINDS_SUPABASE,cfg=window.MINDS_SUPABASE_CONFIG;
      if(!sb||!cfg?.url||!cfg.publishableKey)throw new Error(lv("No hay conexión con MINDS.","Keine Verbindung zu Romy."));
      const {data:{session},error}=await sb.auth.getSession();
      if(error||!session?.access_token)throw new Error(lv("Inicia sesión primero en el chat de Isabella.","Bitte zuerst im Office anmelden."));
      if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error(lv("Este navegador no admite la conexión de audio necesaria.","Dieser Browser unterstützt die benötigte Audioverbindung nicht."));
      if(token!==epoch)return;

      microphone=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
      });
      if(token!==epoch){microphone?.getTracks().forEach(t=>t.stop());return}
      if(voice===ORIGINAL_VOICE){
        state("connecting","Preparando una voz original para Isabella…");
        const created=await fetch(cfg.url+"/functions/v1/isabella-live-session",{
          method:"POST",
          headers:{apikey:cfg.publishableKey,Authorization:"Bearer "+session.access_token,
            "Content-Type":"application/json"},
          body:JSON.stringify({action:"ensure_original_voice"})
        });
        const payload=await created.json().catch(()=>null);
        if(token!==epoch)return;
        if(!created.ok||payload?.ready!==true)
          throw new Error(shownError[payload?.error]||"No pude crear la voz original de Isabella.");
      }
      const connection=new RTCPeerConnection();
      peer=connection;
      connection.addEventListener("track",event=>{
        if(token!==epoch||event.track.kind!=="audio")return;
        remoteTrack=true;
        audio.srcObject=new MediaStream([event.track]);
        tryPlay();
      });
      connection.addEventListener("connectionstatechange",()=>{
        if(token===epoch&&connection.connectionState==="failed")stop(lv("La conexión de voz se interrumpió.","Die Audioverbindung wurde unterbrochen."));
      });
      microphone.getAudioTracks().forEach(track=>connection.addTrack(track,microphone));
      channel=connection.createDataChannel("oai-events");
      channel.addEventListener("message",e=>handleEvent(e.data,token));
      channel.addEventListener("close",()=>{
        if(token===epoch&&active)stop(lv("El canal de voz se cerró.","Der Sprachkanal wurde geschlossen."));
      });
      const offer=await connection.createOffer();
      await connection.setLocalDescription(offer);
      await iceReady(connection);
      if(token!==epoch)return;

      state("connecting",lv("Abriendo sesión GPT‑Live…","GPT-Live-Sitzung wird geöffnet …"));
      const response=await fetch(cfg.url+"/functions/v1/isabella-live-session",{
        method:"POST",
        headers:{
          apikey:cfg.publishableKey,
          Authorization:"Bearer "+session.access_token,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({sdp:connection.localDescription?.sdp||"",voice})
      });
      const result=await response.json().catch(()=>null);
      if(token!==epoch)return;
      if(!response.ok)throw new Error(shownError[result?.error]||lv("El servidor rechazó la sesión de Live.","Der Server hat die Live-Sitzung abgelehnt."));
      if(result?.transport?.type!=="webrtc"||typeof result.transport.sdp!=="string"||
         result.transport.sdp.length<50||!result.transport.sdp.startsWith("v=0")){
        throw new Error(lv("La respuesta WebRTC no es válida.","Die WebRTC-Antwort ist ungültig."));
      }
      conversationId=result.session?.conversation_id;
      if(!conversationId)throw Error(lv("No pude identificar tu chat para guardar la conversación.","Der zugehörige Chat konnte nicht verifiziert werden."));
      transcript=makeTranscript({url:cfg.url,key:cfg.publishableKey,token:session.access_token},conversationId);
      await connection.setRemoteDescription({type:"answer",sdp:result.transport.sdp});
      if(token!==epoch)return;
      state("active",lv("Conectando el altavoz…","Lautsprecher wird verbunden …"));
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
