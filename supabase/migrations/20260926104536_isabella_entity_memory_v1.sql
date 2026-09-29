
create table if not exists public.isabella_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  name text not null,
  normalized_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, entity_type, normalized_name)
);

create table if not exists public.isabella_entity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references public.isabella_entities(id) on delete cascade,
  predicate text not null,
  object_entity_id uuid references public.isabella_entities(id) on delete cascade,
  object_text text,
  source_type text,
  source_id text,
  confidence real not null default 0.8,
  valid_from timestamptz,
  valid_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (object_entity_id is not null or nullif(trim(object_text),'') is not null)
);

create index if not exists isabella_entities_user_name_idx
  on public.isabella_entities(user_id, normalized_name);
create index if not exists isabella_entity_links_user_subject_idx
  on public.isabella_entity_links(user_id, subject_entity_id);
create index if not exists isabella_entity_links_user_object_idx
  on public.isabella_entity_links(user_id, object_entity_id);
create index if not exists isabella_entity_links_user_predicate_idx
  on public.isabella_entity_links(user_id, predicate);

alter table public.isabella_entities enable row level security;
alter table public.isabella_entity_links enable row level security;

drop policy if exists "isabella_entities_own" on public.isabella_entities;
create policy "isabella_entities_own" on public.isabella_entities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "isabella_entity_links_own" on public.isabella_entity_links;
create policy "isabella_entity_links_own" on public.isabella_entity_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.isabella_entity_recall(p_query text, p_limit integer default 12)
returns table(
  source_type text,
  source_id text,
  content text,
  occurred_at timestamptz,
  score real
)
language sql
stable
set search_path = public
as $$
with q as (
  select lower(coalesce(nullif(trim(p_query),''),'__nothing__')) as raw
),
entity_hits as (
  select
    'entity'::text as source_type,
    e.id::text as source_id,
    concat_ws(' · ', e.entity_type, e.name)::text as content,
    e.updated_at as occurred_at,
    (
      similarity(lower(e.name), q.raw)
      + case when lower(e.name) like '%' || q.raw || '%' then 0.7 else 0 end
    )::real as score
  from public.isabella_entities e cross join q
  where e.user_id = auth.uid()
    and (
      similarity(lower(e.name), q.raw) > 0.10
      or lower(e.name) like '%' || q.raw || '%'
      or q.raw like '%' || lower(e.name) || '%'
    )
),
link_hits as (
  select
    'entity_link'::text as source_type,
    l.id::text as source_id,
    concat_ws(' · ',
      s.entity_type || ': ' || s.name,
      l.predicate,
      case when o.id is not null then o.entity_type || ': ' || o.name else l.object_text end
    )::text as content,
    l.updated_at as occurred_at,
    (
      similarity(lower(s.name || ' ' || l.predicate || ' ' || coalesce(o.name,l.object_text,'')), q.raw)
      + case when lower(s.name || ' ' || l.predicate || ' ' || coalesce(o.name,l.object_text,'')) like '%' || q.raw || '%' then 0.8 else 0 end
      + least(greatest(l.confidence,0),1) * 0.15
    )::real as score
  from public.isabella_entity_links l
  join public.isabella_entities s on s.id=l.subject_entity_id
  left join public.isabella_entities o on o.id=l.object_entity_id
  cross join q
  where l.user_id=auth.uid()
    and (
      similarity(lower(s.name || ' ' || l.predicate || ' ' || coalesce(o.name,l.object_text,'')), q.raw) > 0.08
      or lower(s.name || ' ' || l.predicate || ' ' || coalesce(o.name,l.object_text,'')) like '%' || q.raw || '%'
    )
)
select * from (
  select * from entity_hits
  union all
  select * from link_hits
) x
where score > 0
order by score desc, occurred_at desc
limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_entity_recall(text, integer) to authenticated;
