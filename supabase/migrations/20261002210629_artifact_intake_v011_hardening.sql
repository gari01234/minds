create index minds_artifact_intake_accepted_artifact_idx
  on public.minds_artifact_intake(accepted_artifact_id)
  where accepted_artifact_id is not null;

create policy "artifact intake review own"
on public.minds_artifact_intake for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

grant update(status,review_note) on public.minds_artifact_intake to authenticated;

create or replace function public.minds_review_artifact_intake(
  p_intake_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_status text;
  v_row public.minds_artifact_intake%rowtype;
begin
  if v_uid is null then raise exception 'artifact_intake_auth_required'; end if;
  if p_decision not in ('accepted','rejected') then
    raise exception 'artifact_intake_invalid_decision';
  end if;
  if p_note is not null and length(p_note)>2000 then
    raise exception 'artifact_intake_note_too_long';
  end if;

  select status into v_status
  from public.minds_artifact_intake
  where id=p_intake_id and user_id=v_uid
  for update;

  if not found then raise exception 'artifact_intake_not_found'; end if;
  if v_status<>'pending' then raise exception 'artifact_intake_not_pending'; end if;

  update public.minds_artifact_intake
  set status=p_decision,
      review_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_intake_id and user_id=v_uid
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'status',v_row.status,
    'accepted_at',v_row.accepted_at,
    'rejected_at',v_row.rejected_at
  );
end $$;

revoke all on function public.minds_review_artifact_intake(uuid,text,text) from public,anon,authenticated;
grant execute on function public.minds_review_artifact_intake(uuid,text,text) to authenticated;
