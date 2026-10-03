begin;

insert into auth.users(id,aud,role,email)
values ('f6200000-0000-4000-8000-000000000072','authenticated','authenticated','mcp-grant-test@example.invalid');

select set_config('request.jwt.claim.sub','f6200000-0000-4000-8000-000000000072',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  c jsonb; w jsonb; r jsonb;
  exec_id uuid;
  grant_id uuid;
  failed boolean:=false;
begin
  c:=public.minds_create_commitment(
    '{"title":"MCP Grant Test","objective":"Validate grant boundary","scope":"global","completion_criteria":"Works"}'::jsonb,
    'f6200000-0000-4000-8000-000000000073'::uuid,true
  );
  w:=public.minds_ensure_commitment_workspace((c->>'id')::uuid);
  r:=public.minds_start_mission_run(
    (w->'workspace'->>'id')::uuid,
    'Read only.',
    'f6200000-0000-4000-8000-000000000074'::uuid,
    2
  );
  perform public.minds_pause_mission_run((r->'run'->>'id')::uuid);

  insert into public.minds_mission_runtime_executions(
    mission_run_id,user_id,provider,mode,lifecycle
  ) values (
    (r->'run'->>'id')::uuid,
    'f6200000-0000-4000-8000-000000000072'::uuid,
    'openai_agents','shadow','created'
  ) returning id into exec_id;

  insert into public.minds_runtime_capability_grants(
    execution_id,user_id,token_hash,capabilities,expires_at,metadata
  ) values (
    exec_id,
    '00000000-0000-4000-8000-000000000000'::uuid,
    repeat('a',64),
    array['read_mission_workspace']::text[],
    now()+interval '30 minutes',
    '{"test":true}'::jsonb
  ) returning id into grant_id;

  if (select user_id from public.minds_runtime_capability_grants where id=grant_id)
     <> 'f6200000-0000-4000-8000-000000000072'::uuid then
    raise exception 'runtime_capability_user_not_derived';
  end if;

  if has_table_privilege('authenticated','public.minds_runtime_capability_grants','SELECT') then
    raise exception 'runtime_capability_table_exposed';
  end if;

  update public.minds_runtime_capability_grants
  set use_count=use_count+1,last_used_at=now()
  where id=grant_id and status='active' and expires_at>now();

  if (select use_count from public.minds_runtime_capability_grants where id=grant_id)<>1 then
    raise exception 'runtime_capability_usage_not_recorded';
  end if;

  update public.minds_runtime_capability_grants set status='revoked' where id=grant_id;

  if (select revoked_at from public.minds_runtime_capability_grants where id=grant_id) is null then
    raise exception 'runtime_capability_revocation_not_recorded';
  end if;

  failed:=false;
  begin
    update public.minds_runtime_capability_grants set status='active' where id=grant_id;
  exception when others then failed:=true;
  end;
  if not failed then raise exception 'runtime_capability_reactivation_allowed'; end if;

  failed:=false;
  begin
    insert into public.minds_runtime_capability_grants(
      execution_id,user_id,token_hash,capabilities,expires_at
    ) values (
      exec_id,
      'f6200000-0000-4000-8000-000000000072'::uuid,
      repeat('b',64),
      array['write_workspace']::text[],
      now()+interval '30 minutes'
    );
  exception when others then failed:=true;
  end;
  if not failed then raise exception 'runtime_capability_write_scope_allowed'; end if;

  failed:=false;
  begin
    insert into public.minds_mission_runtime_executions(
      mission_run_id,user_id,provider,mode,lifecycle
    ) values (
      (r->'run'->>'id')::uuid,
      'f6200000-0000-4000-8000-000000000072'::uuid,
      'native_minds','shadow','created'
    ) returning id into exec_id;

    insert into public.minds_runtime_capability_grants(
      execution_id,user_id,token_hash,capabilities,expires_at
    ) values (
      exec_id,
      'f6200000-0000-4000-8000-000000000072'::uuid,
      repeat('c',64),
      array['read_mission_workspace']::text[],
      now()+interval '30 minutes'
    );
  exception when others then failed:=true;
  end;
  if not failed then raise exception 'runtime_capability_native_provider_allowed'; end if;
end $$;

rollback;
