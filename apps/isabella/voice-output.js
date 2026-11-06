// Isabella · canonical voice replies v0.1.
// Speech is an optional rendering of a completed, verified Isabella chat reply.
// This module never invokes an LLM, writes a conversation, or authorizes an action.
(()=>{
  'use strict';
  const button=document.getElementById('micButton');
  let current=null;
  let generation=0;

  function available(){
    return !!window.speechSynthesis&&typeof window.SpeechSynthesisUtterance==='function';
  }
  function buttonState(speaking){
    if(!button)return;
    button.classList.toggle('voice-speaking',speaking);
    button.setAttribute('aria-label',speaking?'Detener respuesta hablada':'Hablar');
    button.title=speaking?'Detener respuesta hablada':'Hablar';
  }
  function textForSpeech(markdown){
    let text=String(markdown||'')
      .replace(/```[\s\S]*?```/g,' ')
      .replace(/`[^`\n]+`/g,' ')
      .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g,'$1')
      .replace(/https?:\/\/\S+/g,' ')
      .replace(/<[^>]*>/g,' ')
      .replace(/(?:^|\n)\s*[-•]\s+/g,', ')
      .replace(/[\*#_~>]/g,' ')
      .replace(/\s+/g,' ').trim();
    if(text.length>720){
      const prefix=text.slice(0,721),word=prefix.lastIndexOf(' ');
      text=prefix.slice(0,word>300?word:720)+'…';
    }
    return text;
  }
  function stop(){
    generation++;
    current=null;
    try{window.speechSynthesis?.cancel()}catch{}
    buttonState(false);
  }
  function speak(markdown){
    const text=textForSpeech(markdown);
    if(!available()||!text||document.hidden)return false;
    stop();
    const token=generation;
    let utterance;
    try{utterance=new window.SpeechSynthesisUtterance(text)}catch{return false}
    utterance.lang=document.documentElement?.lang==='es'?'es-ES':
      (document.documentElement?.lang||navigator.language||'es-ES');
    utterance.rate=1;
    const clear=()=>{
      if(token===generation&&current===utterance){
        current=null;
        buttonState(false);
      }
    };
    utterance.onend=clear;
    utterance.onerror=clear;
    current=utterance;
    buttonState(true);
    try{window.speechSynthesis.speak(utterance);return true}
    catch{stop();return false}
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
  window.addEventListener('pagehide',stop);
  window.addEventListener('isabella:before-screen-change',stop);
  window.ISABELLA_VOICE_OUTPUT=Object.freeze({available,speak,stop,isSpeaking:()=>current!==null,textForSpeech});
})();
