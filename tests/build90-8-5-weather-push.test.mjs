import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const chat=read('supabase/functions/isabella-chat/index.ts');
const sql=read('supabase/migrations/20261011105500_durable_chat_attention_completion.sql');

test('90.8.5: Chat reuses a fresh, user-scoped, sourced forecast from Ahora',()=>{
  assert.match(chat,/async function currentWeatherFromSituation\(/);
  assert.match(chat,/eq\("user_id",user\.id\)/);
  assert.match(chat,/eq\("surface","feed"\)\.eq\("status","active"\)/);
  assert.match(chat,/contains\("metadata",\{kind:"weather"\}\)/);
  assert.match(chat,/Date\.now\(\)-2\*3600000/);
  assert.match(chat,/eq\("preference_key","feed"\)\.eq\("status","confirmed"\)/);
  assert.match(chat,/situation_weather:situationWeather/);
  assert.match(chat,/No afirmes que careces de acceso al pronóstico/);
});
test('weather retains the same tool-capable reasoning path as other requests',()=>{
  const fn=chat.slice(chat.indexOf('function directTextStreamEligible'),chat.indexOf('function parseOpenAISse'));
  assert.match(fn,/return false;/);
  assert.doesNotMatch(fn,/\.test\(/);
  assert.match(chat,/situation_weather:situationWeather/);
});
test('90.8.5: completion pushes are idempotent and governed by Attention Economy',()=>{
  assert.match(sql,/when 'chat_reply_ready' then v_route:='interrupt'/);
  assert.match(sql,/if v_route='interrupt' and not v_hard then/);
  assert.match(sql,/quiet_hours/);
  assert.match(sql,/interruption_budget/);
  assert.match(sql,/old.status is distinct from new.status/);
  assert.match(sql,/on conflict \(user_id,event_key\) do nothing/);
  assert.match(sql,/minds_route_attention\(new.user_id/);
  assert.match(sql,/notification_only',true/);
  assert.match(sql,/create trigger minds_chat_job_attention_on_completion/);
  const onlyTrigger=sql.slice(sql.indexOf('create or replace function public.minds_notify_durable_chat_v01()'));
  assert.ok(!onlyTrigger.includes('insert into public.conversation_messages'));
  assert.ok(!onlyTrigger.includes('update public.isabella_tasks'));
  assert.ok(!onlyTrigger.includes('sendPushNotification'));
});
