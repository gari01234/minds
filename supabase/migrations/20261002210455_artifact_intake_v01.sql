create table public.minds_artifact_intake (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.minds_mission_runtime_executions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai_agents')),
  provider_artifact_id text not null check (length(trim(provider_artifact_id)) between 1 and 500),
  provider_path text not null check (
    length(provider_path) between 1 and 1200
    and provider_path like '/workspace/outputs/%'
    and position('..' in provider_path)=0
  ),
  kind text not null check (kind in ('image','docx','pdf','markdown')),
  title text not null check (length(trim(title)) between 1 and 240),
  mime_type text not null check (
    (kind='image' and mime_type in ('image/png','image/jpeg','image/webp'))
    or (kind='docx' and mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (kind='pdf' and mime_type='application/pdf')
    or (kind='markdown' and mime_type='text/markdown')
  ),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  quarantine_storage_path text not null check (
    length(quarantine_storage_path) between 1 and 1400
    and position('..' in quarantine_storage_path)=0
  ),
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','promoted','failed','expired')),
  review_note text null check (review_note is null or length(review_note)<=2000),
  accepted_artifact_id uuid null references public.minds_artifacts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz null,
  rejected_at timestamptz null,
  promoted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(execution_id,provider_artifact_id)
);

create index minds_artifact_intake_user_status_idx
  on public.minds_artifact_intake(user_id,status,created_at desc);
create index minds_artifact_intake_execution_idx
  on public.minds_artifact_intake(execution_id,created_at asc);

create or replace function public.minds_artifact_intake_guard()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_user uuid;
  v_provider text;
  v_prefix text;
begin
  select user_id,provider into v_user,v_provider
  from public.minds_mission_runtime_executions
  where id=new.execution_id;

  if v_user is null then raise exception 'artifact_intake_execution_missing'; end if;
  if v_provider<>'openai_agents' or new.provider<>v_provider then
    raise exception 'artifact_intake_provider_mismatch';
  end if;

  new.user_id:=v_user;
  v_prefix:=v_user::text||'/'||new.execution_id::text||'/';
  if new.quarantine_storage_path not like v_prefix||'%' then
    raise exception 'artifact_intake_quarantine_path_mismatch';
  end if;

  if tg_op='INSERT' then
    if new.status<>'pending' then raise exception 'artifact_intake_must_start_pending'; end if;
    new.accepted_artifact_id:=null;
    new.accepted_at:=null;
    new.rejected_at:=null;
    new.promoted_at:=null;
  else
    if new.execution_id<>old.execution_id
       or new.provider<>old.provider
       or new.provider_artifact_id<>old.provider_artifact_id
       or new.provider_path<>old.provider_path
       or new.kind<>old.kind
       or new.mime_type<>old.mime_type
       or new.size_bytes<>old.size_bytes
       or new.sha256<>old.sha256
       or new.quarantine_storage_path<>old.quarantine_storage_path
    then raise exception 'artifact_intake_identity_immutable'; end if;

    if new.status<>old.status then
      if old.status='pending' and new.status in ('accepted','rejected','expired') then null;
      elsif old.status='accepted' and new.status in ('promoted','failed','expired') then null;
      else raise exception 'artifact_intake_invalid_transition:%->%',old.status,new.status;
      end if;
    end if;

    if new.status='accepted' and old.status='pending' then
      new.accepted_at:=coalesce(new.accepted_at,now());
    end if;
    if new.status='rejected' and old.status='pending' then
      new.rejected_at:=coalesce(new.rejected_at,now());
    end if;
    if new.status='promoted' then
      if new.accepted_artifact_id is null then raise exception 'artifact_intake_promoted_without_artifact'; end if;
      new.promoted_at:=coalesce(new.promoted_at,now());
    elsif new.accepted_artifact_id is not null then
      raise exception 'artifact_intake_artifact_only_when_promoted';
    end if;
  end if;

  new.updated_at:=now();
  return new;
end $$;

revoke all on function public.minds_artifact_intake_guard() from public,anon,authenticated;

create trigger minds_artifact_intake_guard_trg
before insert or update on public.minds_artifact_intake
for each row execute function public.minds_artifact_intake_guard();

alter table public.minds_artifact_intake enable row level security;

create policy "artifact intake select own"
on public.minds_artifact_intake for select to authenticated
using ((select auth.uid())=user_id);

revoke all on public.minds_artifact_intake from anon,authenticated;
grant select on public.minds_artifact_intake to authenticated;
grant select,insert,update,delete on public.minds_artifact_intake to service_role;

create or replace function public.minds_review_artifact_intake(
  p_intake_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'minds-artifact-intake','minds-artifact-intake',false,20971520,
  array[
    'image/png','image/jpeg','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf','text/markdown'
  ]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- No anon/authenticated storage policies by design: quarantine is service-only.
