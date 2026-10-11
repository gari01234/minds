import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const old=read('supabase/migrations/20261011105500_durable_chat_attention_completion.sql');
const migration=read('supabase/migrations/20261011123000_durable_chat_attention_source_contract.sql');
test('90.8.5.1: durable completion provenance is accepted by Attention Economy',()=>{
  assert.match(old,/'chat',new\.id::text,'chat_reply_ready'/);
  assert.match(old,/create trigger minds_chat_job_attention_on_completion/);
  assert.match(migration,/drop constraint minds_attention_events_source_type_check/);
  assert.match(migration,/add constraint minds_attention_events_source_type_check/);
  for(const kind of ['mission','heartbeat','routine','system','expectation','chat'])
    assert.ok(migration.includes("'"+kind+"'"),'source class must remain allowed: '+kind);
  assert.doesNotMatch(migration,/insert into|delete from|update public\.|drop table|drop trigger/i);
});
