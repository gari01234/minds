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
  assert.match(ai,/needsCalendarAssessment|calendarAssessmentIntent/,'Client must gate schedule assessments');
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
  assert.ok(!/if\(!finalText\.trim\(\)\)throw new Error\("empty_stream_response"\);\s*if\(persistPresence/.test(stream),
    'Non-empty text alone is not a completion criterion');
});

test('90.5: absence of terminal result cannot quietly start another generation',()=>{
  const start=ai.indexOf('async function askDirectStream(');
  const end=ai.indexOf('function messageMentionsKnownProject(',start);
  assert.ok(start>0&&end>start);
  const client=ai.slice(start,end);
  assert.match(client,/missing_result_event|stream_interrupted|missing_completion|final_result_required/);
  assert.match(client,/throw new Error\(String\(streamError\|\|transportError/,'A missing terminal event must fail instead of returning null');
  assert.match(client,/if\(streamedText\.trim\(\)\)/,'Keep any received partial response');
  assert.match(client,/if\(result\)return result/,'Only explicit terminal results count as full streaming receipts');
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
