begin;

insert into auth.users(id,aud,role,email)
values ('f6100000-0000-4000-8000-000000000072','authenticated','authenticated','artifact-intake-test@example.invalid');

select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000072',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare c jsonb; w jsonb; r jsonb;
begin
  c:=public.minds_create_commitment(
    '{"title":"Artifact Intake Test","objective":"Validate intake boundary","scope":"global","completion_criteria":"Works"}'::jsonb,
    'f6100000-0000-4000-8000-000000000073'::uuid,true
  );
  w:=public.minds_ensure_commitment_workspace((c->>'id')::uuid);
  r:=public.minds_start_mission_run(
    (w->'workspace'->>'id')::uuid,
    'Produce candidate.',
    'f6100000-0000-4000-8000-000000000074'::uuid,
    2
  );
  perform public.minds_pause_mission_run((r->'run'->>'id')::uuid);

  insert into public.minds_mission_runtime_executions(
    id,mission_run_id,user_id,provider,mode,lifecycle
  ) values (
    'f6100000-0000-4000-8000-000000000075'::uuid,
    (r->'run'->>'id')::uuid,
    'f6100000-0000-4000-8000-000000000072'::uuid,
    'openai_agents','shadow','succeeded'
  );

  insert into public.minds_artifact_intake(
    id,execution_id,user_id,provider,provider_artifact_id,provider_path,
    kind,title,mime_type,size_bytes,sha256,quarantine_storage_path
  ) values (
    'f6100000-0000-4000-8000-000000000076'::uuid,
    'f6100000-0000-4000-8000-000000000075'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'openai_agents','artifact_invoker','/workspace/outputs/report.md',
    'markdown','Report','text/markdown',12,repeat('c',64),
    'f6100000-0000-4000-8000-000000000072/f6100000-0000-4000-8000-000000000075/artifact_invoker/report.md'
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000072',true);
select set_config('request.jwt.claim.role','authenticated',true);

select public.minds_review_artifact_intake(
  'f6100000-0000-4000-8000-000000000076'::uuid,
  'accepted',
  'authenticated invoker test'
);

reset role;

do $$
declare
  failed boolean:=false;
  artifact_id uuid;
begin
  if (select status from public.minds_artifact_intake
      where id='f6100000-0000-4000-8000-000000000076')<>'accepted' then
    raise exception 'artifact_intake_review_failed';
  end if;

  if not has_column_privilege('authenticated','public.minds_artifact_intake','status','UPDATE') then
    raise exception 'artifact_intake_status_update_privilege_missing';
  end if;

  if has_column_privilege('authenticated','public.minds_artifact_intake','sha256','UPDATE') then
    raise exception 'artifact_intake_identity_column_exposed';
  end if;

  begin
    update public.minds_artifact_intake
    set status='promoted'
    where id='f6100000-0000-4000-8000-000000000076';
  exception when others then
    failed:=true;
  end;
  if not failed then raise exception 'artifact_intake_promoted_without_artifact'; end if;

  insert into public.minds_artifacts(
    user_id,workspace_id,source_kind,kind,title,mime_type,storage_path,metadata
  ) values (
    'f6100000-0000-4000-8000-000000000072'::uuid,
    null,'mission_runtime','markdown','Report','text/markdown',
    'f6100000-0000-4000-8000-000000000072/runtime/f6100000-0000-4000-8000-000000000076/report.md',
    '{"artifact_intake_test":true}'::jsonb
  ) returning id into artifact_id;

  update public.minds_artifact_intake
  set status='promoted',accepted_artifact_id=artifact_id
  where id='f6100000-0000-4000-8000-000000000076';

  if (select status from public.minds_artifact_intake
      where id='f6100000-0000-4000-8000-000000000076')<>'promoted' then
    raise exception 'artifact_intake_promotion_failed';
  end if;

  failed:=false;
  begin
    insert into public.minds_artifact_intake(
      execution_id,user_id,provider,provider_artifact_id,provider_path,
      kind,title,mime_type,size_bytes,sha256,quarantine_storage_path
    ) values (
      'f6100000-0000-4000-8000-000000000075'::uuid,
      'f6100000-0000-4000-8000-000000000072'::uuid,
      'openai_agents','bad_path','/workspace/outputs/x.md',
      'markdown','Bad','text/markdown',2,repeat('b',64),'wrong/prefix/x.md'
    );
  exception when others then
    failed:=true;
  end;
  if not failed then raise exception 'artifact_intake_bad_quarantine_path_allowed'; end if;

  if exists(
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and (coalesce(qual,'') ilike '%minds-artifact-intake%'
           or coalesce(with_check,'') ilike '%minds-artifact-intake%')
  ) then
    raise exception 'artifact_intake_quarantine_storage_exposed';
  end if;
end $$;

rollback;
