import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');

test('Build 91.5: review-specific explicit controls are not generic feed learning',()=>{
  const app=read('apps/isabella/app.js');
  assert.ok(app.includes("String(item.metadata?.reason_code||'')==='contextual_reassessment'"));
  assert.ok(app.includes("contextualReview?'Me ayudó':'Me gusta'"));
  assert.ok(app.includes("contextualReview?'No encajaba':'No es relevante'"));
  assert.ok(app.includes('!contextualReview?'));
  assert.ok(app.includes("recordFeedSignal(action,item)"));
  assert.ok(app.includes("if(String(item.metadata?.reason_code||'')!=='contextual_reassessment')recordFeedSignal(action,item)"));
  assert.ok(app.includes("explicit_useful"));
  assert.ok(app.includes("explicit_not_applicable"));
});
test('Build 91.5: only explicit review feedback creates observations, never accepted POM rules',()=>{
  const sql=read('supabase/migrations/20261010181000_situational_review_feedback_v01.sql');
  assert.match(sql,/new\.action not in \('liked','not_relevant'\)/);
  assert.ok(sql.includes("metadata->>'reason_code'='contextual_reassessment'"));
  assert.ok(sql.includes("'planning','proposal_outcome','proposal_feedback'"));
  assert.ok(sql.includes("'causal_status','unconfirmed'"));
  assert.ok(sql.includes("'accepted_rule',false"));
  assert.ok(sql.includes('on conflict (user_id,fingerprint) do nothing'));
  assert.ok(!sql.includes('minds_operating_model_claims'));
  assert.ok(!sql.includes('minds_operating_model_hypotheses'));
  assert.ok(!sql.includes('minds_permissions'));
  assert.ok(!sql.includes('isabella_tasks'));
});
test('Build 91.5: review feedback identifies the exact surface and underlying attention event',()=>{
  const sql=read('supabase/migrations/20261010181000_situational_review_feedback_v01.sql');
  assert.ok(sql.includes("'attention_event_id',v_item.metadata->>'attention_event_id'"));
  assert.ok(sql.includes("'surface_item_id',v_item.id"));
  assert.ok(sql.includes("'feedback_id',new.id"));
  assert.ok(sql.includes('where id=new.item_id and user_id=new.user_id'));
  assert.ok(sql.includes("md5('situational_review_feedback:'||new.id::text)"));
});
