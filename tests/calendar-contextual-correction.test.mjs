import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isContextualCorrection,findCalendarCorrection,localDateAt} from
  "../supabase/functions/_shared/calendar-contextual-correction.mjs";
const chat=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
const conversation=[
 {role:"user",created_at:"2026-10-12T19:02:58.887Z",
  content:"Agrega para mañana proyecto Bernried hacer un Besprechungsnotiz"},
 {role:"assistant",created_at:"2026-10-12T19:03:20.873Z",
  content:"He preparado la tarea para mañana, domingo 11 de octubre: Besprechungsnotiz"},
 {role:"user",created_at:"2026-10-12T19:04:10.150Z",
  content:"Mañana es martes , te has confundido"},
 {role:"assistant",created_at:"2026-10-12T19:04:15.951Z",
  content:"Sí, tienes razón, mañana es martes. Lo corrijo."},
 {role:"user",created_at:"2026-10-12T20:25:09.359Z",content:"Por favor corrígelo"}
];
const task={id:"cff47094-5de6-4f3c-9666-465fdc152cd2",
  client_key:"mumwc0jue9mv5me79d",title:"Besprechungsnotiz",
  due_date:"2026-10-11",created_at:"2026-10-12T19:03:28.112Z",
  completed_at:null,archived_at:null,metadata:{source:"isabella"}};
const options={timezone:"Europe/Berlin",nowIso:"2026-10-12T20:27:00Z"};
test("actual 'Por favor corrígelo' is an action, never informational",()=>{
 for(const x of ["Por favor corrígelo","Corrígelo","corrígela","Corrige la fecha","Arréglalo","sí, corrígelo"])
  assert.equal(isContextualCorrection(x),true,x);
 for(const x of ["Corrige este ensayo sobre arquitectura","Analiza esto","Cómo se corrige el Attika"])
  assert.equal(isContextualCorrection(x),false,x);
});
test("link the original Monday user request to ONE existing task and calculate Tue 13",()=>{
 const result=findCalendarCorrection(conversation,[task],options);
 assert.equal(result.kind,"proposal");
 assert.equal(result.proposal.kind,"task");
 assert.equal(result.proposal.action,"update");
 assert.equal(result.proposal.target_id,task.client_key);
 assert.equal(result.proposal.target_title,task.title);
 assert.equal(result.proposal.target_date,"2026-10-11");
 assert.equal(result.proposal.date,"2026-10-13");
});
test("the original message date, not the correction turn date, determines tomorrow",()=>{
 assert.equal(localDateAt("2026-10-12T19:02:58.887Z","Europe/Berlin"),"2026-10-12");
 assert.equal(localDateAt("2026-10-24T23:30:00Z","Europe/Berlin"),"2026-10-25");
 const later={...options,nowIso:"2026-10-13T21:00:00Z"};
 assert.equal(findCalendarCorrection(conversation,[task],later).proposal.date,"2026-10-13");
});
test("fail-closed: no user error acknowledgment, completed, multiple or stale tasks",()=>{
 assert.equal(findCalendarCorrection(conversation.slice(0,2),[task],options).kind,"unresolved");
 assert.equal(findCalendarCorrection(conversation,[{...task,completed_at:options.nowIso}],options).kind,"unresolved");
 assert.equal(findCalendarCorrection(conversation,[{...task,created_at:"2026-10-11T18:00:00Z"}],options).kind,"unresolved");
 assert.equal(findCalendarCorrection(conversation,[task,{...task,id:"different",client_key:"different"}],options).reason,"ambiguous_task");
 assert.equal(findCalendarCorrection(conversation,[{...task,due_date:"2026-10-13"}],options).kind,"unresolved");
 assert.equal(findCalendarCorrection(conversation,[{...task,metadata:{source:"user"}}],options).kind,"unresolved");
});
test("the executable chat path does not let durable text-only consume corrections",()=>{
 assert.match(chat,/isContextualCorrection\(effectiveMessage\)/);
 assert.match(chat,/body\?\.durable===true\|\|body\?\.stream===true/);
 assert.match(chat,/contextual_action_requires_review/);
 assert.match(chat,/prepareContextualCalendarCorrection\(req,context\)/);
 assert.match(chat,/recordShadowDecision\(req,"update_task",reviewed/);
 assert.match(chat,/source_tainted:false/);
 assert.match(chat,/user_confirmation_required:true/);
 assert.match(chat,/admission\.decision\.candidate/);
 assert.doesNotMatch(chat,/prepareContextualCalendarCorrection[\s\S]{0,4300}\.from\("isabella_tasks"\)\.update\(/);
});
