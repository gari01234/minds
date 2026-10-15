#!/usr/bin/env node
/* Read-only, production-schema-based semantic evaluation. No Supabase writes.
 * Run: OPENAI_API_KEY=... node scripts/eval-calendar-semantics.mjs
 * Schema sanity: node scripts/eval-calendar-semantics.mjs --dry-run
 */
import {readFileSync,writeFileSync} from "node:fs";
import vm from "node:vm";
import {performance} from "node:perf_hooks";
import {verifyCalendarSemanticProposal,validatedCalendarClock}
  from "../supabase/functions/_shared/calendar-semantic-boundary.mjs";
const source=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const instructions=source.match(/const fastCalendarInstructions=\x60([\s\S]*?)\x60;/)?.[1];
const start=source.indexOf("const calendarTools = [");
const end=source.indexOf("\n];",start);
if(!instructions||start<0||end<start)throw Error("production_contract_not_found");
const literal=source.slice(start+"const calendarTools = ".length,end+2);
const fromProduction=vm.runInNewContext("("+literal+")",Object.create(null),{timeout:1000});
const names=["create_task","create_event","update_task","update_event"];
const tools=names.map(n=>fromProduction.find(t=>t.name===n));
if(tools.some(t=>!t||t.type!=="function"))throw Error("invalid_live_calendar_schema");
const clarification={type:"function",name:"request_clarification",strict:false,
  description:"Ask a concrete question only when information is genuinely missing or inconsistent. Never reconfirm a complete, consistent instruction.",
  parameters:{type:"object",properties:{
    question:{type:"string"},capability:{type:"string",enum:["calendar","work","general"]}
  },required:["question","capability"]}};
const cases=[
 ["es.complete","Agrega un Termin proyecto Schwarz para el martes 27 a las 11 de la mañana, dos horas. Nombre del Termin es Abgabe LP2",{name:"create_event",title:"Abgabe LP2",project:"Schwarz",date:"2026-10-27",time:"11:00",duration_minutes:120}],
 ["es.paraphrase","Para Schwarz, bloquea dos horas el 27 de octubre desde las 11 para Abgabe LP2.",{name:"create_event",title:"Abgabe LP2",project:"Schwarz",date:"2026-10-27",time:"11:00",duration_minutes:120}],
 ["de.complete","Bitte Abgabe LP2 für Schwarz am Dienstag, 27. Oktober 2026, von 11 bis 13 Uhr eintragen.",{name:"create_event",title:"Abgabe LP2",project:"Schwarz",date:"2026-10-27",time:"11:00",duration_minutes:120}],
 ["en.complete","Create an appointment Abgabe LP2 for Schwarz on Tuesday October 27, 2026 from 11 AM to 1 PM.",{name:"create_event",title:"Abgabe LP2",project:"Schwarz",date:"2026-10-27",time:"11:00",duration_minutes:120}],
 ["es.tomorrow.morning","Crea una reunión llamada Revisión para mañana a las 11 de la mañana, duración dos horas.",{name:"create_event",title:"Revisión",date:"2026-10-15",time:"11:00",duration_minutes:120}],
 ["es.task","Agrega para mañana la tarea Enviar Angebot ELT.",{name:"create_task",title:"Enviar Angebot ELT",date:"2026-10-15"}],
 ["es.missing.duration","Crea una cita con los Bauherren el martes 27 a las 11.",{name:"request_clarification"}],
 ["es.unclear.referent","Mueve aquella reunión a mañana.",{name:"request_clarification"}],
 ["es.contradiction","Agenda Revisión el miércoles 27 de octubre de 2026 a las 11 durante dos horas.",{name:"request_clarification"}]
];
const dry=process.argv.includes("--dry-run"),outputFlag=process.argv.indexOf("--output");
const output=outputFlag>=0?process.argv[outputFlag+1]:null;
const model=process.env.OPENAI_MODEL||"gpt-5.6-luna";
function score(call,expected,utterance){
 if(!call)return [false,"no_tool_call"];
 if(call.name==="request_clarification")
   return expected.name===call.name?[true,"correct_abstention"]:[false,"redundant_clarification"];
 if(call.name!==expected.name)return [false,"wrong_action"];
 let p;try{p=JSON.parse(call.arguments||"{}")}catch{return [false,"bad_json"]}
 const kind=call.name.endsWith("task")?"task":"event";
 const proposed={kind,action:call.name.startsWith("create")?"create":"update",
   title:p.title,date:p.date,time:p.time,duration_minutes:p.duration_minutes};
 const semantic=verifyCalendarSemanticProposal(proposed,p.temporal_grounding,utterance,"2026-10-14");
 if(semantic.kind!=="verified")return [false,"invalid_grounding_"+semantic.reason];
 if(validatedCalendarClock(semantic.proposal).kind==="needs_clarification")return [false,"invalid_clock"];
 for(const field of ["title","date","time","duration_minutes","project"]){
   if(expected[field]==null)continue;
   const actual=field==="date"?semantic.proposal.date:p[field];
   if(actual!==expected[field])return [false,"wrong_"+field];
 }
 return [true,"valid"];
}
const report={version:"v0.1",mode:dry?"schema_check":"real_model",model:dry?null:model,results:[]};
if(dry){
 for(const [id,,expected] of cases)report.results.push({id,tool_available:
   expected.name==="request_clarification"||tools.some(t=>t.name===expected.name)});
}else{
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Error("OPENAI_API_KEY not available; no private runtime key is retrieved");
 for(const [id,utterance,expected] of cases){
  const startTime=performance.now();
  const res=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,reasoning:{effort:"low"},
      max_output_tokens:1200,tool_choice:"required",tools:[clarification,...tools],
      input:[{role:"user",content:[{type:"input_text",text:
        "Time zone Europe/Berlin. Server local date 2026-10-14. Owner message: "+utterance}]}]})
  });
  const data=await res.json();const call=(data.output||[]).find(x=>x.type==="function_call");
  const [pass,reason]=res.ok?score(call,expected,utterance):[false,"provider_error"];
  report.results.push({id,pass,reason,observed:call?.name||null,
    latency_ms:Math.round(performance.now()-startTime),
    input_tokens:data.usage?.input_tokens||0,output_tokens:data.usage?.output_tokens||0});
 }
 report.pass_rate=report.results.filter(x=>x.pass).length/report.results.length;
 if(report.pass_rate<0.8)process.exitCode=1;
}
const result=JSON.stringify(report,null,2);
if(output)writeFileSync(output,result+"\n");
process.stdout.write(result+"\n");
