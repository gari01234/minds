-- Build 85.2 — scoped recall, provenance-bearing embeddings and exposure receipts.

alter table public.isabella_memories
  add column if not exists exposure_scope_key text not null default 'global',
  add column if not exists provenance_class text not null default 'owner';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='isabella_memories_provenance_class_check') then
    alter table public.isabella_memories add constraint isabella_memories_provenance_class_check
      check (provenance_class in ('owner','agent','external','system'));
  end if;
end $$;

update public.isabella_memories
set provenance_class=case
  when source in ('ai_derived','assistant','agent') then 'agent'
  when source in ('web','external','project_source') then 'external'
  when source in ('system') then 'system'
  else 'owner'
end
where provenance_class='owner'
  and source in ('ai_derived','assistant','agent','web','external','project_source','system');

create index if not exists isabella_memories_scope_idx
  on public.isabella_memories(user_id,status,exposure_scope_key,updated_at desc);

alter table public.isabella_embeddings
  add column if not exists exposure_scope_key text not null default 'legacy',
  add column if not exists provenance_class text not null default 'owner';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='isabella_embeddings_provenance_class_check') then
    alter table public.isabella_embeddings add constraint isabella_embeddings_provenance_class_check
      check (provenance_class in ('owner','agent','external','system'));
  end if;
end $$;

-- Conversation embeddings before Build 85 have no trustworthy scope boundary.
-- They are derived cache, not memory, so discard them instead of guessing.
delete from public.isabella_embeddings where source_type='conversation';

update public.isabella_embeddings e
set exposure_scope_key=m.exposure_scope_key,
    provenance_class=m.provenance_class
from public.isabella_memories m
where e.source_type='memory'
  and e.source_id=m.id::text
  and e.user_id=m.user_id;

create index if not exists isabella_embeddings_scope_idx
  on public.isabella_embeddings(user_id,exposure_scope_key,source_type);

create table if not exists public.minds_exposure_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid null references public.minds_agent_runs(id) on delete cascade,
  channel text not null check (channel in ('lexical','semantic','entity','work','sofia','tool')),
  active_scope_key text not null,
  source_type text not null,
  source_id text not null,
  source_scope_key text not null,
  provenance_class text not null check (provenance_class in ('owner','agent','external','system','unknown')),
  admitted_reason text not null check (admitted_reason in ('current_scope','global_layer','explicit_cross_scope','system_layer')),
  query_fingerprint text null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create unique index if not exists minds_exposure_receipts_run_source_uidx
  on public.minds_exposure_receipts(user_id,run_id,channel,source_type,source_id);

create index if not exists minds_exposure_receipts_user_idx
  on public.minds_exposure_receipts(user_id,created_at desc);

alter table public.minds_exposure_receipts enable row level security;

drop policy if exists "minds_exposure_receipts_select_own" on public.minds_exposure_receipts;
create policy "minds_exposure_receipts_select_own" on public.minds_exposure_receipts
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_exposure_receipts from anon,authenticated;
grant select on public.minds_exposure_receipts to authenticated;
grant select,insert,update,delete on public.minds_exposure_receipts to service_role;


create or replace function public.isabella_recall_scoped(
  p_query text,
  p_scope_key text,
  p_allow_cross_scope boolean default false,
  p_limit integer default 12
)
returns table (
  source_type text,
  source_id text,
  content text,
  occurred_at timestamptz,
  score real,
  source_scope_key text,
  provenance_class text
)
language sql
stable
security invoker
set search_path=public
as $$
with q as (
  select
    websearch_to_tsquery('simple', coalesce(nullif(trim(p_query),''), '__nothing__')) as tsq,
    lower(coalesce(nullif(trim(p_query),''), '__nothing__')) as raw,
    coalesce(nullif(trim(p_scope_key),''),'global') as scope_key
),
memory_hits as (
  select
    'memory'::text as source_type,
    m.id::text as source_id,
    concat_ws(' · ', nullif(m.subject,''), m.content)::text as content,
    m.updated_at as occurred_at,
    (
      ts_rank_cd(
        to_tsvector('simple', coalesce(m.subject,'') || ' ' || coalesce(m.content,'')),
        q.tsq
      ) * 2.0
      + similarity(lower(coalesce(m.subject,'') || ' ' || coalesce(m.content,'')), q.raw)
      + least(greatest(m.confidence::real,0),1) * 0.15
    )::real as score,
    m.exposure_scope_key as source_scope_key,
    m.provenance_class
  from public.isabella_memories m
  cross join q
  where m.user_id=auth.uid()
    and m.status='active'
    and (
      p_allow_cross_scope
      or m.exposure_scope_key='global'
      or m.exposure_scope_key=q.scope_key
    )
    and (
      to_tsvector('simple', coalesce(m.subject,'') || ' ' || coalesce(m.content,'')) @@ q.tsq
      or similarity(lower(coalesce(m.subject,'') || ' ' || coalesce(m.content,'')), q.raw)>0.10
    )
),
conversation_hits as (
  select
    'conversation'::text,
    cm.id::text,
    cm.content::text,
    cm.created_at,
    (
      ts_rank_cd(to_tsvector('simple',coalesce(cm.content,'')),q.tsq)*1.55
      + similarity(lower(coalesce(cm.content,'')),q.raw)
      + case when cm.role='user' then 0.12 else 0 end
    )::real,
    case when cm.exposure_scope_version=1 then cm.exposure_scope_key else 'legacy' end,
    cm.provenance_class
  from public.conversation_messages cm
  join public.conversations c on c.id=cm.conversation_id
  cross join q
  where cm.user_id=auth.uid()
    and c.user_id=auth.uid()
    and c.app_scope='isabella'
    and cm.role in ('user','assistant')
    and (
      (cm.exposure_scope_version=1 and (p_allow_cross_scope or cm.exposure_scope_key=q.scope_key))
      or (p_allow_cross_scope and cm.exposure_scope_version=0)
    )
    and (
      to_tsvector('simple',coalesce(cm.content,'')) @@ q.tsq
      or similarity(lower(coalesce(cm.content,'')),q.raw)>0.13
    )
),
preference_hits as (
  select
    'preference'::text,
    p.id::text,
    (p.preference_key||': '||p.value::text)::text,
    p.updated_at,
    (
      ts_rank_cd(to_tsvector('simple',p.preference_key||' '||p.value::text),q.tsq)*1.8
      + similarity(lower(p.preference_key||' '||p.value::text),q.raw)
      + least(greatest(p.confidence::real,0),1)*0.15
    )::real,
    'global'::text,
    'owner'::text
  from public.isabella_preferences p
  cross join q
  where p.user_id=auth.uid()
    and p.status<>'rejected'
    and (
      to_tsvector('simple',p.preference_key||' '||p.value::text) @@ q.tsq
      or similarity(lower(p.preference_key||' '||p.value::text),q.raw)>0.10
    )
),
people_hits as (
  select
    'person'::text,
    p.id::text,
    concat_ws(' · ',p.name,nullif(p.relationship,''),case when p.birthday is not null then 'cumpleaños '||p.birthday::text end)::text,
    p.updated_at,
    (
      ts_rank_cd(to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.relationship,'')||' '||coalesce(p.birthday::text,'')),q.tsq)*1.8
      + similarity(lower(coalesce(p.name,'')||' '||coalesce(p.relationship,'')),q.raw)
    )::real,
    'global'::text,
    'owner'::text
  from public.isabella_people p
  cross join q
  where p.user_id=auth.uid()
    and (
      to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.relationship,'')||' '||coalesce(p.birthday::text,'')) @@ q.tsq
      or similarity(lower(coalesce(p.name,'')||' '||coalesce(p.relationship,'')),q.raw)>0.10
    )
)
select source_type,source_id,content,occurred_at,score,source_scope_key,provenance_class
from (
  select * from memory_hits
  union all select * from conversation_hits
  union all select * from preference_hits
  union all select * from people_hits
) hits
where score>0
order by score desc,occurred_at desc
limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_recall_scoped(text,text,boolean,integer) to authenticated;


create or replace function public.isabella_semantic_recall_scoped(
  p_embedding extensions.vector(1536),
  p_scope_key text,
  p_allow_cross_scope boolean default false,
  p_limit integer default 10
)
returns table(
  source_type text,
  source_id text,
  content text,
  score real,
  source_scope_key text,
  provenance_class text
)
language sql
stable
security invoker
set search_path=public,extensions
as $$
  select
    e.source_type,e.source_id,e.content,
    (1-(e.embedding<=>p_embedding))::real as score,
    e.exposure_scope_key,e.provenance_class
  from public.isabella_embeddings e
  where e.user_id=auth.uid()
    and (
      p_allow_cross_scope
      or e.exposure_scope_key='global'
      or e.exposure_scope_key=coalesce(nullif(trim(p_scope_key),''),'global')
    )
  order by e.embedding<=>p_embedding
  limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_semantic_recall_scoped(extensions.vector,text,boolean,integer) to authenticated;
