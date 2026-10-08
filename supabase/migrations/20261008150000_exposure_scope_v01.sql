-- Build 85.1 — scoped conversation exposure.
-- Legacy messages remain exposure_scope_version=0 and are never auto-injected into the new scoped working context.

alter table public.conversation_messages
  add column if not exists exposure_scope_version smallint not null default 0,
  add column if not exists exposure_scope_kind text not null default 'global',
  add column if not exists exposure_scope_ref text null,
  add column if not exists exposure_scope_key text not null default 'legacy',
  add column if not exists provenance_class text not null default 'owner';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='conversation_messages_exposure_scope_version_check') then
    alter table public.conversation_messages add constraint conversation_messages_exposure_scope_version_check
      check (exposure_scope_version in (0,1));
  end if;
  if not exists (select 1 from pg_constraint where conname='conversation_messages_exposure_scope_kind_check') then
    alter table public.conversation_messages add constraint conversation_messages_exposure_scope_kind_check
      check (exposure_scope_kind in ('global','project','work_thread','reading','theory'));
  end if;
  if not exists (select 1 from pg_constraint where conname='conversation_messages_provenance_class_check') then
    alter table public.conversation_messages add constraint conversation_messages_provenance_class_check
      check (provenance_class in ('owner','agent','external','system'));
  end if;
end $$;

update public.conversation_messages
set provenance_class=case role when 'user' then 'owner' when 'assistant' then 'agent' else 'system' end
where provenance_class is distinct from case role when 'user' then 'owner' when 'assistant' then 'agent' else 'system' end;

create or replace function public.minds_conversation_message_provenance_guard()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.provenance_class:=case new.role when 'user' then 'owner' when 'assistant' then 'agent' else 'system' end;
  if new.exposure_scope_version=1 then
    if new.exposure_scope_kind='global' then
      new.exposure_scope_ref:=null;
      new.exposure_scope_key:='global';
    elsif nullif(trim(coalesce(new.exposure_scope_ref,'')),'') is null then
      raise exception 'exposure_scope_ref_required';
    else
      new.exposure_scope_key:=new.exposure_scope_kind||':'||trim(new.exposure_scope_ref);
    end if;
  else
    new.exposure_scope_key:='legacy';
  end if;
  return new;
end $$;

drop trigger if exists conversation_messages_provenance_guard on public.conversation_messages;
create trigger conversation_messages_provenance_guard
before insert or update of role,exposure_scope_version,exposure_scope_kind,exposure_scope_ref,exposure_scope_key,provenance_class
on public.conversation_messages
for each row execute function public.minds_conversation_message_provenance_guard();

create index if not exists conversation_messages_exposure_scope_idx
  on public.conversation_messages(user_id,conversation_id,exposure_scope_version,exposure_scope_key,created_at desc,id desc);

create or replace function public.minds_recent_scoped_messages(
  p_conversation_id uuid,
  p_scope_key text,
  p_limit integer default 24
)
returns table(
  id uuid, role text, content text, created_at timestamptz, metadata jsonb,
  exposure_scope_kind text, exposure_scope_ref text, exposure_scope_key text, provenance_class text
)
language sql
stable
security invoker
set search_path=public
as $$
  select cm.id,cm.role,cm.content,cm.created_at,cm.metadata,
         cm.exposure_scope_kind,cm.exposure_scope_ref,cm.exposure_scope_key,cm.provenance_class
  from public.conversation_messages cm
  join public.conversations c on c.id=cm.conversation_id and c.user_id=cm.user_id
  where cm.user_id=auth.uid()
    and cm.conversation_id=p_conversation_id
    and c.user_id=auth.uid()
    and cm.exposure_scope_version=1
    and cm.exposure_scope_key=trim(coalesce(p_scope_key,'global'))
    and cm.role in ('user','assistant')
  order by cm.created_at desc,cm.id desc
  limit least(greatest(coalesce(p_limit,24),1),80);
$$;

grant execute on function public.minds_recent_scoped_messages(uuid,text,integer) to authenticated;

create or replace function public.minds_scoped_message_count(
  p_conversation_id uuid,
  p_scope_key text
)
returns bigint
language sql
stable
security invoker
set search_path=public
as $$
  select count(*)
  from public.conversation_messages cm
  join public.conversations c on c.id=cm.conversation_id and c.user_id=cm.user_id
  where cm.user_id=auth.uid()
    and cm.conversation_id=p_conversation_id
    and c.user_id=auth.uid()
    and cm.exposure_scope_version=1
    and cm.exposure_scope_key=trim(coalesce(p_scope_key,'global'))
    and cm.role in ('user','assistant');
$$;

grant execute on function public.minds_scoped_message_count(uuid,text) to authenticated;