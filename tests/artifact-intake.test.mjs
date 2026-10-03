import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const v01=read('supabase/migrations/20261002210455_artifact_intake_v01.sql');
const v011=read('supabase/migrations/20261002210629_artifact_intake_v011_hardening.sql');

test('Build 72.6E quarantines provider artifacts outside accepted MINDS artifacts',()=>{
  assert.ok(v01.includes('create table public.minds_artifact_intake'));
  assert.ok(v01.includes('references public.minds_mission_runtime_executions(id) on delete cascade'));
  assert.ok(v01.includes("provider_path like '/workspace/outputs/%'"));
  assert.ok(v01.includes("kind in ('image','docx','pdf','markdown')"));
  assert.ok(v01.includes("size_bytes between 1 and 20971520"));
  assert.ok(v01.includes("sha256 ~ '^[0-9a-f]{64}$'"));
  assert.ok(v01.includes("'minds-artifact-intake','minds-artifact-intake',false"));
  assert.ok(!v01.includes('on storage.objects'));
});

test('Build 72.6E derives ownership from the runtime and enforces bounded transitions',()=>{
  assert.ok(v01.includes('select user_id,provider into v_user,v_provider'));
  assert.ok(v01.includes('new.user_id:=v_user'));
  assert.ok(v01.includes("artifact_intake_provider_mismatch"));
  assert.ok(v01.includes("artifact_intake_quarantine_path_mismatch"));
  assert.ok(v01.includes("old.status='pending' and new.status in ('accepted','rejected','expired')"));
  assert.ok(v01.includes("old.status='accepted' and new.status in ('promoted','failed','expired')"));
  assert.ok(v01.includes('artifact_intake_promoted_without_artifact'));
});

test('Build 72.6E review runs with caller authority and exposes only review columns',()=>{
  assert.ok(v011.includes('security invoker'));
  assert.ok(v011.includes('create policy "artifact intake review own"'));
  assert.ok(v011.includes('grant update(status,review_note) on public.minds_artifact_intake to authenticated'));
  assert.ok(!v011.includes('grant update on public.minds_artifact_intake to authenticated'));
  assert.ok(v011.includes('minds_artifact_intake_accepted_artifact_idx'));
});

test('Build 72.6E does not turn intake candidates into memory or workspace truth',()=>{
  const all=v01+'\n'+v011;
  assert.ok(!all.includes('minds_memory'));
  assert.ok(!all.includes('minds_commitment_workspace_items'));
  assert.ok(!all.includes('minds_append_commitment_workspace_item'));
  assert.ok(!all.includes('minds_publish_attention'));
  assert.ok(!all.includes('minds_messages'));
  assert.ok(all.includes('accepted_artifact_id uuid null references public.minds_artifacts'));
});


test('Build 72.7 authenticates artifact preview and promotion through MINDS',()=>{
  const edge=read('supabase/functions/isabella-artifact-intake/index.ts');
  const app=read('apps/isabella/app.js');
  const config=read('supabase/config.toml');

  assert.ok(edge.includes('auth.getUser(token)'));
  assert.ok(edge.includes('.eq("id",intakeId).eq("user_id",user.id)'));
  assert.ok(edge.includes('intake.status!=="accepted"'));
  assert.ok(edge.includes('bytes.byteLength!==Number(intake.size_bytes)'));
  assert.ok(edge.includes('digest!==String(intake.sha256)'));
  assert.ok(edge.includes('storage.from("minds-artifact-intake")'));
  assert.ok(edge.includes('storage.from("minds-artifacts").upload'));
  assert.ok(edge.includes('source_kind:"mission_runtime"'));
  assert.ok(edge.includes('status:"promoted"'));
  assert.ok(edge.includes('event_type:"artifact.promoted"'));
  assert.ok(!edge.includes('minds_commitment_workspace_items'));
  assert.ok(!edge.includes('minds_append_commitment_workspace_item'));

  assert.ok(app.includes('async function previewArtifactIntake'));
  assert.ok(app.includes('async function reviewArtifactIntake'));
  assert.ok(app.includes("rpc('minds_review_artifact_intake'"));
  assert.ok(app.includes("functions.invoke('isabella-artifact-intake'"));
  assert.ok(app.includes('data-intake-preview'));
  assert.ok(app.includes('data-intake-accept'));
  assert.ok(app.includes('data-intake-reject'));
  assert.ok(app.includes("source_kind==='mission_runtime'"));
  assert.ok(!app.includes("storage.from('minds-artifact-intake')"));

  const block=config.slice(config.indexOf('[functions.isabella-artifact-intake]'));
  assert.ok(block.includes('verify_jwt = true'));
});

test('Build 72.7 keeps human acceptance between provider output and permanent artifact',()=>{
  const app=read('apps/isabella/app.js');
  const edge=read('supabase/functions/isabella-artifact-intake/index.ts');
  assert.ok(app.includes("p_decision:decision"));
  assert.ok(app.includes("decision==='accepted'"));
  assert.ok(edge.includes('if(intake.status!=="accepted")'));
  assert.ok(edge.includes('accepted_artifact_id:artifact.id'));
  assert.ok(edge.includes('storage.from("minds-artifact-intake").remove'));
});
