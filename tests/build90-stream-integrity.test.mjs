import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ai=file('apps/isabella/ai.js');
const edge=file('supabase/functions/isabella-chat/index.ts');
const app=file('apps/isabella/app.js');

test('90.5: weekly schedule assessment cannot use tool-free direct stream',()=>{
  // A conversational question about the next week needs the canonical search_calendar tool.
  // A compact agenda snapshot is not a substitute for a dated search.
  // 11.11.2026: the app never asks for the tool-free stream, so there is nothing to gate by wording.
  assert.doesNotMatch(ai,/stream:true/,'Client must not request the tool-free direct stream');
  assert.match(edge,/calendarAssessmentIntent|scheduleAssessment/,'Server must reject direct stream for calendar assessments');
  assert.match(edge,/search_calendar/,'Canonical calendar search must remain available');
});

test('90.5: a stream needs explicit successful terminal state before success',()=>{
  const start=edge.indexOf('if(directTextStream){');
  const end=edge.indexOf('const fastAgendaToolNames',start);
  assert.ok(start>0&&end>start,'Streaming handler must remain accessible');
  const stream=edge.slice(start,end);
  assert.match(stream,/response\.incomplete/,'Handle OpenAI incomplete event explicitly');
  assert.match(stream,/response\.completed/,'Handle completed event explicitly');
  assert.match(stream,/completed\?\.status\s*===\s*["\x27]completed/,'Successful completion must require provider status');
  assert.match(stream,/incomplete_response|incomplete_reason/,'Incomplete outputs must be marked');
  assert.match(stream,/streamCompleted\?"success":"error"/,'Only provider completion can produce a successful run');
  assert.match(stream,/incomplete_response:!streamCompleted/,'Persist an explicit incomplete receipt');
});

test('90.5: absence of terminal result cannot quietly start another generation',()=>{
  // 11.11.2026: the direct stream is gone. The governed turn recovers its own result by receipt
  // and fails loudly instead of sending the request again.
  const start=ai.indexOf('async function ask(message,state,options={})');
  const end=ai.indexOf('async function brief(state)',start);
  assert.ok(start>0&&end>start);
  const client=ai.slice(start,end);
  assert.ok(!ai.includes('async function askDirectStream('));
  assert.match(client,/if\(data\?\.pending\)data=await recover\(\)/);
  assert.match(client,/throw new Error\('No pude recuperar el resultado de este turno\.'\)/,'A missing result must fail instead of starting another generation');
  assert.match(client,/NEVER re-submit the model or replay any action\/proposal/);
});

test('90.5: partial responses must be visible and never silently represented as complete',()=>{
  assert.match(app,/incomplete_response|incomplete_reason|responseIncomplete/,
    'Message UI must expose an explicit incomplete state');
  assert.match(edge,/incomplete_reason|incomplete_response/,
    'Server must provide an explicit incomplete receipt');
});

test('90.5: Threads and Chat both persist partial status and require explicit continuation',()=>{
  const work=file('apps/isabella/work.js');
  assert.match(work,/incomplete_response:!!result\?\.incomplete/);
  assert.match(work,/data-thread-continue/);
  assert.match(app,/data-continue-incomplete/);
  assert.match(app,/Continuar respuesta/);
});

test('90.5: exact reported weekly question requires calendar access on both sides',()=>{
  // The app no longer recognises questions by their wording (11.11.2026).
  assert.ok(!ai.includes('function needsCalendarAssessment('));
  const serverStart=edge.indexOf('function calendarAssessmentIntent(');
  const serverEnd=edge.indexOf('function simpleAgendaMutation(',serverStart);
  assert.ok(serverStart>=0&&serverEnd>serverStart);
  const source=edge.slice(serverStart,serverEnd).replace('message:string','message');
  const server=new Function('normalizeText',source+';return calendarAssessmentIntent;')(s=>String(s||'').trim().toLowerCase());
  for(const question of ['que tal pinta la siguiente semana?','¿Cómo pinta la próxima semana?','Qué tengo el lunes?']){
    assert.equal(server(question),true,'Server must recognize: '+question);
  }
  for(const smallTalk of ['Qué tal?', 'Cuéntame algo bonito']){
    assert.equal(server(smallTalk),false);
  }
  assert.match(edge,/scheduleAssessment&&round===0\?\{tool_choice:\{type:"function",name:"search_calendar"\}\}/,'Schedule must force a canonical calendar lookup before evaluating the week');
});
