-- Build 85.4 — lineage-aware forgetting.
-- Forgetting invalidates admissibility and derived lineage while preserving audit rows.

create table if not exists public.minds_memory_lineage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in (
    'agent_run','conversation','memory','model_claim','entity','entity_link'
  )),
  source_id text not null,
  child_kind text not null check (child_kind in (
    'memory','model_claim','entity','entity_link'
  )),
  child_id text not null,
  source_scope_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  unique(user_id,source_kind,source_id,child_kind,child_id)
);

create index if not exists minds_memory_lineage_source_idx
  on public.minds_memory_lineage(user_id,source_kind,source_id)
  where invalidated_at is null;
create index if not exists minds_memory_lineage_child_idx
  on public.minds_memory_lineage(user_id,child_kind,child_id);

create table if not exists public.minds_memory_forget_tombstones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  reason text not null default 'user_forget',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  forgotten_at timestamptz not null default now(),
  unique(user_id,source_kind,source_id)
);

create index if not exists minds_memory_forget_tombstones_user_idx
  on public.minds_memory_forget_tombstones(user_id,forgotten_at desc);

alter table public.minds_memory_lineage enable row level security;
alter table public.minds_memory_forget_tombstones enable row level security;

drop policy if exists minds_memory_lineage_select_own on public.minds_memory_lineage;
create policy minds_memory_lineage_select_own on public.minds_memory_lineage
  for select to authenticated using ((select auth.uid())=user_id);

drop policy if exists minds_memory_forget_tombstones_select_own on public.minds_memory_forget_tombstones;
create policy minds_memory_forget_tombstones_select_own on public.minds_memory_forget_tombstones
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_memory_lineage from anon,authenticated;
revoke all on public.minds_memory_forget_tombstones from anon,authenticated;
grant select on public.minds_memory_lineage to authenticated;
grant select on public.minds_memory_forget_tombstones to authenticated;
grant select,insert,update,delete on public.minds_memory_lineage to service_role;
grant select,insert,update,delete on public.minds_memory_forget_tombstones to service_role;


create or replace function public.minds_capture_lineage(
  p_user uuid,
  p_child_kind text,
  p_child_id text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run text:=nullif(trim(coalesce(p_metadata->>'run_id','')),'');
  v_conversation text:=nullif(trim(coalesce(p_metadata->>'conversation_id','')),'');
  v_scope text:=nullif(trim(coalesce(p_metadata->>'exposure_scope_key',p_metadata#>>'{exposure_scope,key}','')),'');
begin
  if p_user is null or nullif(trim(coalesce(p_child_id,'')),'') is null then return; end if;

  if v_run is not null then
    insert into public.minds_memory_lineage(user_id,source_kind,source_id,child_kind,child_id,source_scope_key,metadata)
    values(p_user,'agent_run',v_run,p_child_kind,p_child_id,v_scope,jsonb_build_object('captured_from','runtime_provenance'))
    on conflict(user_id,source_kind,source_id,child_kind,child_id)
    do update set source_scope_key=excluded.source_scope_key,metadata=public.minds_memory_lineage.metadata||excluded.metadata;
  end if;

  if v_conversation is not null then
    insert into public.minds_memory_lineage(user_id,source_kind,source_id,child_kind,child_id,source_scope_key,metadata)
    values(p_user,'conversation',v_conversation,p_child_kind,p_child_id,v_scope,jsonb_build_object('captured_from','runtime_provenance'))
    on conflict(user_id,source_kind,source_id,child_kind,child_id)
    do update set source_scope_key=excluded.source_scope_key,metadata=public.minds_memory_lineage.metadata||excluded.metadata;
  end if;
end;
$$;

revoke all on function public.minds_capture_lineage(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.minds_capture_lineage(uuid,text,text,jsonb) to service_role;


create or replace function public.minds_capture_memory_lineage_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.minds_capture_lineage(new.user_id,'memory',new.id::text,new.metadata);
  return new;
end;
$$;

drop trigger if exists minds_capture_memory_lineage on public.isabella_memories;
create trigger minds_capture_memory_lineage
after insert or update of metadata on public.isabella_memories
for each row execute function public.minds_capture_memory_lineage_trigger();


create or replace function public.minds_capture_model_claim_lineage_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  item jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(new.evidence,'[]'::jsonb))
  loop
    perform public.minds_capture_lineage(new.user_id,'model_claim',new.id::text,item);
  end loop;
  return new;
end;
$$;

drop trigger if exists minds_capture_model_claim_lineage on public.isabella_model_claims;
create trigger minds_capture_model_claim_lineage
after insert or update of evidence on public.isabella_model_claims
for each row execute function public.minds_capture_model_claim_lineage_trigger();


create or replace function public.minds_capture_entity_lineage_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.minds_capture_lineage(new.user_id,'entity',new.id::text,new.metadata);
  return new;
end;
$$;

drop trigger if exists minds_capture_entity_lineage on public.isabella_entities;
create trigger minds_capture_entity_lineage
after insert or update of metadata on public.isabella_entities
for each row execute function public.minds_capture_entity_lineage_trigger();


create or replace function public.minds_capture_entity_link_lineage_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.minds_capture_lineage(new.user_id,'entity_link',new.id::text,new.metadata);
  return new;
end;
$$;

drop trigger if exists minds_capture_entity_link_lineage on public.isabella_entity_links;
create trigger minds_capture_entity_link_lineage
after insert or update of metadata on public.isabella_entity_links
for each row execute function public.minds_capture_entity_link_lineage_trigger();


create or replace function public.minds_invalidate_memory_lineage(
  p_user uuid,
  p_source_kind text,
  p_source_id text,
  p_reason text default 'user_forget'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz:=now();
  v_memories integer:=0;
  v_claims integer:=0;
  v_entities integer:=0;
  v_links integer:=0;
begin
  if p_user is null or nullif(trim(coalesce(p_source_kind,'')),'') is null or nullif(trim(coalesce(p_source_id,'')),'') is null then
    raise exception 'invalid_forget_source';
  end if;

  insert into public.minds_memory_forget_tombstones(user_id,source_kind,source_id,reason,forgotten_at)
  values(p_user,p_source_kind,p_source_id,coalesce(nullif(trim(p_reason),''),'user_forget'),v_now)
  on conflict(user_id,source_kind,source_id)
  do update set reason=excluded.reason,forgotten_at=excluded.forgotten_at;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  insert into public.minds_memory_forget_tombstones(user_id,source_kind,source_id,reason,forgotten_at)
  select p_user,a.kind,a.id,'derived_from_forgotten_source',v_now from affected a
  on conflict(user_id,source_kind,source_id)
  do update set reason=excluded.reason,forgotten_at=excluded.forgotten_at;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  update public.minds_memory_lineage l
  set invalidated_at=v_now,invalidation_reason=coalesce(nullif(trim(p_reason),''),'user_forget')
  where l.user_id=p_user and (
    (l.source_kind=p_source_kind and l.source_id=p_source_id)
    or exists(select 1 from affected a where a.kind=l.child_kind and a.id=l.child_id)
  );

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  update public.isabella_memories m
  set status='archived',
      metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object('forgotten_at',v_now,'forgotten_reason',coalesce(nullif(trim(p_reason),''),'user_forget')),
      updated_at=v_now
  where m.user_id=p_user and (
    (p_source_kind='memory' and m.id::text=p_source_id)
    or exists(select 1 from affected a where a.kind='memory' and a.id=m.id::text)
  );
  get diagnostics v_memories=row_count;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  update public.isabella_model_claims c
  set status='stale',
      metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object('forgotten_at',v_now,'forgotten_reason',coalesce(nullif(trim(p_reason),''),'user_forget')),
      last_seen_at=v_now
  where c.user_id=p_user and (
    (p_source_kind='model_claim' and c.id::text=p_source_id)
    or exists(select 1 from affected a where a.kind='model_claim' and a.id=c.id::text)
  );
  get diagnostics v_claims=row_count;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  update public.isabella_entities e
  set metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('forgotten_at',v_now,'forgotten_reason',coalesce(nullif(trim(p_reason),''),'user_forget')),
      updated_at=v_now
  where e.user_id=p_user and (
    (p_source_kind='entity' and e.id::text=p_source_id)
    or exists(select 1 from affected a where a.kind='entity' and a.id=e.id::text)
  );
  get diagnostics v_entities=row_count;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  update public.isabella_entity_links e
  set metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('forgotten_at',v_now,'forgotten_reason',coalesce(nullif(trim(p_reason),''),'user_forget')),
      updated_at=v_now
  where e.user_id=p_user and (
    (p_source_kind='entity_link' and e.id::text=p_source_id)
    or exists(select 1 from affected a where a.kind='entity_link' and a.id=e.id::text)
  );
  get diagnostics v_links=row_count;

  with recursive affected(kind,id) as (
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    where l.user_id=p_user and l.source_kind=p_source_kind and l.source_id=p_source_id
    union
    select l.child_kind,l.child_id
    from public.minds_memory_lineage l
    join affected a on l.source_kind=a.kind and l.source_id=a.id
    where l.user_id=p_user
  )
  delete from public.isabella_embeddings emb
  where emb.user_id=p_user and (
    (p_source_kind='memory' and emb.source_type='memory' and emb.source_id=p_source_id)
    or (p_source_kind='conversation' and emb.source_type='conversation' and exists(
      select 1 from public.conversation_messages cm
      where cm.user_id=p_user and cm.conversation_id::text=p_source_id and cm.id::text=emb.source_id
    ))
    or exists(select 1 from affected a where a.kind='memory' and emb.source_type='memory' and emb.source_id=a.id)
  );

  return jsonb_build_object(
    'status','forgotten',
    'source_kind',p_source_kind,
    'source_id',p_source_id,
    'memories_archived',v_memories,
    'claims_staled',v_claims,
    'entities_hidden',v_entities,
    'entity_links_hidden',v_links,
    'forgotten_at',v_now
  );
end;
$$;

revoke all on function public.minds_invalidate_memory_lineage(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.minds_invalidate_memory_lineage(uuid,text,text,text) to service_role;


create or replace function public.minds_forget_memory(p_client_key text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select m.id into v_id
  from public.isabella_memories m
  where m.user_id=v_user and m.client_key=p_client_key
  limit 1;

  if v_id is null then
    return jsonb_build_object('status','not_found','client_key',p_client_key);
  end if;

  return public.minds_invalidate_memory_lineage(v_user,'memory',v_id::text,'user_forget');
end;
$$;

revoke all on function public.minds_forget_memory(text) from public,anon;
grant execute on function public.minds_forget_memory(text) to authenticated;


create or replace function public.minds_forget_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if not exists(
    select 1 from public.conversations c
    where c.id=p_conversation_id and c.user_id=v_user
  ) then
    raise exception 'conversation_not_found';
  end if;

  return public.minds_invalidate_memory_lineage(v_user,'conversation',p_conversation_id::text,'user_forget_session');
end;
$$;

revoke all on function public.minds_forget_conversation(uuid) from public,anon;
grant execute on function public.minds_forget_conversation(uuid) to authenticated;


-- Lexical recall excludes forgotten memories and forgotten conversation sessions.
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
      ts_rank_cd(to_tsvector('simple',coalesce(m.subject,'')||' '||coalesce(m.content,'')),q.tsq)*2.0
      + similarity(lower(coalesce(m.subject,'')||' '||coalesce(m.content,'')),q.raw)
      + least(greatest(m.confidence::real,0),1)*0.15
    )::real as score,
    m.exposure_scope_key as source_scope_key,
    m.provenance_class
  from public.isabella_memories m
  cross join q
  where m.user_id=auth.uid()
    and m.status='active'
    and not exists(
      select 1 from public.minds_memory_forget_tombstones t
      where t.user_id=m.user_id and t.source_kind='memory' and t.source_id=m.id::text
    )
    and (
      p_allow_cross_scope or m.exposure_scope_key='global' or m.exposure_scope_key=q.scope_key
    )
    and (
      to_tsvector('simple',coalesce(m.subject,'')||' '||coalesce(m.content,''))@@q.tsq
      or similarity(lower(coalesce(m.subject,'')||' '||coalesce(m.content,'')),q.raw)>0.10
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
    and not exists(
      select 1 from public.minds_memory_forget_tombstones t
      where t.user_id=cm.user_id and t.source_kind='conversation' and t.source_id=c.id::text
    )
    and (
      (cm.exposure_scope_version=1 and (p_allow_cross_scope or cm.exposure_scope_key=q.scope_key))
      or (p_allow_cross_scope and cm.exposure_scope_version=0)
    )
    and (
      to_tsvector('simple',coalesce(cm.content,''))@@q.tsq
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
      to_tsvector('simple',p.preference_key||' '||p.value::text)@@q.tsq
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
      to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.relationship,'')||' '||coalesce(p.birthday::text,''))@@q.tsq
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


-- Entity recall hides forgotten entities/relations while preserving their audit rows.
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
security invoker
set search_path=public
as $$
with q as (
  select lower(coalesce(nullif(trim(p_query),''),'__nothing__')) as raw
),
entity_hits as (
  select
    'entity'::text as source_type,
    e.id::text as source_id,
    concat_ws(' · ',e.entity_type,e.name)::text as content,
    e.updated_at as occurred_at,
    (
      similarity(lower(e.name),q.raw)
      + case when lower(e.name) like '%'||q.raw||'%' then 0.7 else 0 end
    )::real as score
  from public.isabella_entities e cross join q
  where e.user_id=auth.uid()
    and nullif(e.metadata->>'forgotten_at','') is null
    and (
      similarity(lower(e.name),q.raw)>0.10
      or lower(e.name) like '%'||q.raw||'%'
      or q.raw like '%'||lower(e.name)||'%'
    )
),
link_hits as (
  select
    'entity_link'::text,
    l.id::text,
    concat_ws(' · ',
      s.entity_type||': '||s.name,
      l.predicate,
      case when o.id is not null then o.entity_type||': '||o.name else l.object_text end
    )::text,
    l.updated_at,
    (
      similarity(lower(s.name||' '||l.predicate||' '||coalesce(o.name,l.object_text,'')),q.raw)
      + case when lower(s.name||' '||l.predicate||' '||coalesce(o.name,l.object_text,'')) like '%'||q.raw||'%' then 0.8 else 0 end
      + least(greatest(l.confidence,0),1)*0.15
    )::real
  from public.isabella_entity_links l
  join public.isabella_entities s on s.id=l.subject_entity_id
  left join public.isabella_entities o on o.id=l.object_entity_id
  cross join q
  where l.user_id=auth.uid()
    and nullif(l.metadata->>'forgotten_at','') is null
    and nullif(s.metadata->>'forgotten_at','') is null
    and (o.id is null or nullif(o.metadata->>'forgotten_at','') is null)
    and (
      similarity(lower(s.name||' '||l.predicate||' '||coalesce(o.name,l.object_text,'')),q.raw)>0.08
      or lower(s.name||' '||l.predicate||' '||coalesce(o.name,l.object_text,'')) like '%'||q.raw||'%'
    )
)
select * from (
  select * from entity_hits
  union all
  select * from link_hits
) x
where score>0
order by score desc,occurred_at desc
limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_entity_recall(text,integer) to authenticated;


-- Semantic recall enforces the same forgetting boundary as lexical recall.
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
    and not (
      e.source_type='memory'
      and exists(
        select 1 from public.minds_memory_forget_tombstones t
        where t.user_id=e.user_id and t.source_kind='memory' and t.source_id=e.source_id
      )
    )
    and not (
      e.source_type='conversation'
      and exists(
        select 1
        from public.conversation_messages cm
        join public.conversations c on c.id=cm.conversation_id and c.user_id=cm.user_id
        join public.minds_memory_forget_tombstones t
          on t.user_id=cm.user_id and t.source_kind='conversation' and t.source_id=c.id::text
        where cm.user_id=e.user_id and cm.id::text=e.source_id
      )
    )
  order by e.embedding<=>p_embedding
  limit least(greatest(p_limit,1),30);
$$;

grant execute on function public.isabella_semantic_recall_scoped(extensions.vector,text,boolean,integer) to authenticated;
