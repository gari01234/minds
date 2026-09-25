-- Additive migration; the old frontends remain compatible. No messages are deleted.
begin;
alter table public.conversations add column app_scope text;
update public.conversations c set app_scope = case
  when c.metadata->>'app' = 'isabella'
    or (c.origin_anchor->>'type' = 'assistant' and c.origin_anchor->>'id' = 'isabella')
    or exists (select 1 from public.conversation_messages m
               where m.conversation_id=c.id and m.metadata->>'app'='isabella')
  then 'isabella' else 'theory' end;
alter table public.conversations alter column app_scope set not null;
alter table public.conversations add constraint conversations_app_scope_check
  check (app_scope in ('theory','isabella'));

-- Legacy clients omit app_scope. Preserve established ownership on updates,
-- and infer old Isabella inserts from their existing explicit app/origin marker.
create function public.set_conversation_app_scope() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.app_scope is distinct from OLD.app_scope then
      raise exception 'Conversation app_scope cannot be changed';
    end if;
  else
    NEW.app_scope := coalesce(NEW.app_scope, case
      when NEW.metadata->>'app'='isabella'
        or (NEW.origin_anchor->>'type'='assistant' and NEW.origin_anchor->>'id'='isabella')
      then 'isabella' else 'theory' end);
  end if;
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object('app', NEW.app_scope);
  return NEW;
end;
$$;
revoke all on function public.set_conversation_app_scope() from public;
create trigger conversations_set_app_scope
before insert or update on public.conversations
for each row execute function public.set_conversation_app_scope();
update public.conversations set metadata = coalesce(metadata,'{}'::jsonb)
  || jsonb_build_object('app',app_scope);
create index conversations_user_app_updated_idx
  on public.conversations(user_id,app_scope,updated_at desc);
comment on column public.conversations.app_scope is
  'Application namespace; ownership remains enforced by existing user RLS.';
commit;
