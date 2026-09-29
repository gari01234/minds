
create extension if not exists pg_trgm;

create index if not exists isabella_memories_fts_idx
  on public.isabella_memories using gin (to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(content,'')));

create index if not exists conversation_messages_fts_idx
  on public.conversation_messages using gin (to_tsvector('simple', coalesce(content,'')));

create or replace function public.isabella_recall(p_query text, p_limit integer default 12)
returns table (
  source_type text,
  source_id text,
  content text,
  occurred_at timestamptz,
  score real
)
language sql
stable
security invoker
set search_path = public
as $$
with q as (
  select
    websearch_to_tsquery('simple', coalesce(nullif(trim(p_query),''), '__nothing__')) as tsq,
    lower(coalesce(nullif(trim(p_query),''), '__nothing__')) as raw
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
    )::real as score
  from public.isabella_memories m
  cross join q
  where m.user_id = auth.uid()
    and m.status = 'active'
    and (
      to_tsvector('simple', coalesce(m.subject,'') || ' ' || coalesce(m.content,'')) @@ q.tsq
      or similarity(lower(coalesce(m.subject,'') || ' ' || coalesce(m.content,'')), q.raw) > 0.10
    )
),
conversation_hits as (
  select
    'conversation'::text as source_type,
    cm.id::text as source_id,
    cm.content::text as content,
    cm.created_at as occurred_at,
    (
      ts_rank_cd(to_tsvector('simple', coalesce(cm.content,'')), q.tsq) * 1.55
      + similarity(lower(coalesce(cm.content,'')), q.raw)
      + case when cm.role='user' then 0.12 else 0 end
    )::real as score
  from public.conversation_messages cm
  join public.conversations c on c.id = cm.conversation_id
  cross join q
  where cm.user_id = auth.uid()
    and c.user_id = auth.uid()
    and c.app_scope = 'isabella'
    and cm.role in ('user','assistant')
    and (
      to_tsvector('simple', coalesce(cm.content,'')) @@ q.tsq
      or similarity(lower(coalesce(cm.content,'')), q.raw) > 0.13
    )
),
preference_hits as (
  select
    'preference'::text as source_type,
    p.id::text as source_id,
    (p.preference_key || ': ' || p.value::text)::text as content,
    p.updated_at as occurred_at,
    (
      ts_rank_cd(to_tsvector('simple', p.preference_key || ' ' || p.value::text), q.tsq) * 1.8
      + similarity(lower(p.preference_key || ' ' || p.value::text), q.raw)
      + least(greatest(p.confidence::real,0),1) * 0.15
    )::real as score
  from public.isabella_preferences p
  cross join q
  where p.user_id = auth.uid()
    and p.status <> 'rejected'
    and (
      to_tsvector('simple', p.preference_key || ' ' || p.value::text) @@ q.tsq
      or similarity(lower(p.preference_key || ' ' || p.value::text), q.raw) > 0.10
    )
),
people_hits as (
  select
    'person'::text as source_type,
    p.id::text as source_id,
    concat_ws(' · ', p.name, nullif(p.relationship,''), case when p.birthday is not null then 'cumpleaños ' || p.birthday::text end)::text as content,
    p.updated_at as occurred_at,
    (
      ts_rank_cd(to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.relationship,'') || ' ' || coalesce(p.birthday::text,'')), q.tsq) * 1.8
      + similarity(lower(coalesce(p.name,'') || ' ' || coalesce(p.relationship,'')), q.raw)
    )::real as score
  from public.isabella_people p
  cross join q
  where p.user_id = auth.uid()
    and (
      to_tsvector('simple', coalesce(p.name,'') || ' ' || coalesce(p.relationship,'') || ' ' || coalesce(p.birthday::text,'')) @@ q.tsq
      or similarity(lower(coalesce(p.name,'') || ' ' || coalesce(p.relationship,'')), q.raw) > 0.10
    )
)
select source_type, source_id, content, occurred_at, score
from (
  select * from memory_hits
  union all
  select * from conversation_hits
  union all
  select * from preference_hits
  union all
  select * from people_hits
) hits
where score > 0
order by score desc, occurred_at desc
limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_recall(text, integer) to authenticated;
