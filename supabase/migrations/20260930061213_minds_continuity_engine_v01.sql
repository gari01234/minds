create table public.minds_continuity_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('heartbeat','work','conversation','routine','project','system')),
  source_id text,
  fingerprint text not null check (length(trim(fingerprint)) between 1 and 500),
  event_type text not null check (length(trim(event_type)) between 1 and 120),
  title text not null check (length(trim(title)) between 1 and 500),
  body text not null default '',
  project_id uuid references public.isabella_projects(id) on delete set null,
  occurred_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  unique(user_id,fingerprint)
);
create index minds_continuity_signals_user_time_idx on public.minds_continuity_signals(user_id,last_seen_at desc);
create index minds_continuity_signals_project_time_idx on public.minds_continuity_signals(project_id,last_seen_at desc) where project_id is not null;
alter table public.minds_continuity_signals enable row level security;
create policy minds_continuity_signals_select_own on public.minds_continuity_signals
for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.minds_continuity_signals from anon,authenticated;
grant select on public.minds_continuity_signals to authenticated;
grant all on public.minds_continuity_signals to service_role;

create table public.minds_commitment_signal_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  commitment_id uuid not null references public.minds_commitments(id) on delete cascade,
  signal_id uuid not null references public.minds_continuity_signals(id) on delete cascade,
  match_kind text not null check (match_kind in ('explicit','project','terms')),
  relevance numeric(4,3) not null check (relevance between 0 and 1),
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique(commitment_id,signal_id)
);
create index minds_commitment_signal_links_user_time_idx on public.minds_commitment_signal_links(user_id,created_at desc);
create index minds_commitment_signal_links_signal_idx on public.minds_commitment_signal_links(signal_id);
alter table public.minds_commitment_signal_links enable row level security;
create policy minds_commitment_signal_links_select_own on public.minds_commitment_signal_links
for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.minds_commitment_signal_links from anon,authenticated;
grant select on public.minds_commitment_signal_links to authenticated;
grant all on public.minds_commitment_signal_links to service_role;

alter table public.minds_commitment_events
  drop constraint minds_commitment_events_event_type_check,
  add constraint minds_commitment_events_event_type_check
    check (event_type in ('created','open_loop_linked','status_changed','note','signal_linked','reactivated','completed'));
alter table public.minds_commitment_events
  drop constraint minds_commitment_events_source_kind_check,
  add constraint minds_commitment_events_source_kind_check
    check (source_kind in ('user','conversation','checkpoint','project','heartbeat','work','routine','system'));

create or replace function public.minds_continuity_terms(p_text text)
returns text[]
language sql
immutable
security invoker
set search_path=public,pg_temp
as $$
  select coalesce(array_agg(distinct term order by term),'{}'::text[])
  from (
    select lower(x) as term
    from regexp_split_to_table(lower(coalesce(p_text,'')), '[^[:alnum:]áéíóúüñäöüß]+') x
    where length(x)>=4
      and lower(x) not in (
        'esto','esta','este','estos','estas','algo','tema','sobre','para','como','cuando','donde','desde','hasta',
        'quiero','queremos','tener','tiene','tengo','seguir','sigue','vivo','viva','abierto','abierta','pendiente',
        'proyecto','commitment','mission','minds','isabella','theory','work',
        'this','that','with','from','have','keep','open','project','about','into',
        'diese','dieser','dieses','eine','einer','einem','einen','projekt','offen','weiter'
      )
  ) q;
$$;
revoke all on function public.minds_continuity_terms(text) from public,anon,authenticated;
grant execute on function public.minds_continuity_terms(text) to service_role;

create or replace function public.minds_publish_continuity_signal(p_user uuid,p_signal jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  sig public.minds_continuity_signals;
  c public.minds_commitments;
  project uuid;
  occurred timestamptz:=now();
  signal_terms text[];
  commitment_terms text[];
  overlap_count integer;
  explicit_match boolean;
  project_match boolean;
  link_id uuid;
  linked_count integer:=0;
  reactivated_count integer:=0;
  kind text;
  score numeric(4,3);
  reason text;
  source_kind text:=lower(trim(coalesce(p_signal->>'source_kind','system')));
  fp text:=trim(coalesce(p_signal->>'fingerprint',''));
  et text:=trim(coalesce(p_signal->>'event_type','change'));
  ttl text:=trim(coalesce(p_signal->>'title',''));
  bdy text:=coalesce(p_signal->>'body','');
  meta jsonb:=coalesce(p_signal->'metadata','{}'::jsonb);
  prior_status text;
  last_continuity jsonb;
begin
  if p_user is null or fp='' or ttl='' then raise exception 'Invalid continuity signal'; end if;
  if source_kind not in ('heartbeat','work','conversation','routine','project','system') then raise exception 'Invalid continuity source'; end if;
  if jsonb_typeof(meta)<>'object' then raise exception 'Invalid continuity metadata'; end if;
  if nullif(p_signal->>'project_id','') is not null then
    begin project:=(p_signal->>'project_id')::uuid; exception when others then raise exception 'Invalid continuity project'; end;
    if not exists(select 1 from public.isabella_projects where id=project and user_id=p_user) then raise exception 'Continuity project not accessible'; end if;
  end if;
  if nullif(p_signal->>'occurred_at','') is not null then
    begin occurred:=(p_signal->>'occurred_at')::timestamptz; exception when others then occurred:=now(); end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('continuity:'||p_user::text||':'||fp,0));
  select * into sig from public.minds_continuity_signals where user_id=p_user and fingerprint=fp for update;
  if not found then
    insert into public.minds_continuity_signals(user_id,source_kind,source_id,fingerprint,event_type,title,body,project_id,occurred_at,metadata)
    values(p_user,source_kind,nullif(p_signal->>'source_id',''),fp,et,ttl,bdy,project,occurred,meta)
    returning * into sig;
  else
    update public.minds_continuity_signals
    set last_seen_at=now(),title=ttl,body=bdy,event_type=et,project_id=coalesce(project,project_id),
        source_id=coalesce(nullif(p_signal->>'source_id',''),source_id),metadata=meta
    where id=sig.id returning * into sig;
  end if;

  signal_terms:=public.minds_continuity_terms(ttl||' '||bdy);

  for c in
    select * from public.minds_commitments
    where user_id=p_user and status in ('active','waiting')
    order by updated_at desc
  loop
    if c.project_id is not null and project is not null and c.project_id<>project then continue; end if;
    explicit_match:=exists(
      select 1 from jsonb_array_elements_text(
        case when jsonb_typeof(p_signal->'commitment_ids')='array' then p_signal->'commitment_ids' else '[]'::jsonb end
      ) x(value) where x.value=c.id::text
    );
    project_match:=project is not null and c.project_id=project;
    commitment_terms:=public.minds_continuity_terms(c.title||' '||c.objective||' '||coalesce(c.completion_criteria,''));
    select count(*) into overlap_count
    from (select unnest(signal_terms) intersect select unnest(commitment_terms)) z;

    if explicit_match then
      kind:='explicit';score:=1.000;reason:='Vínculo explícito con el Commitment.';
    elsif project_match then
      kind:='project';score:=0.950;reason:='Cambio dentro del mismo proyecto.';
    elsif overlap_count>=2 then
      kind:='terms';score:=least(0.900,0.550+(overlap_count::numeric*0.100));reason:=overlap_count||' términos relevantes compartidos.';
    else
      continue;
    end if;

    link_id:=null;
    insert into public.minds_commitment_signal_links(user_id,commitment_id,signal_id,match_kind,relevance,reason)
    values(p_user,c.id,sig.id,kind,score,reason)
    on conflict(commitment_id,signal_id) do nothing
    returning id into link_id;
    if link_id is null then continue; end if;

    linked_count:=linked_count+1;
    prior_status:=c.status;
    last_continuity:=jsonb_build_object(
      'signal_id',sig.id,'signal_title',sig.title,'signal_body',sig.body,'source_kind',sig.source_kind,
      'event_type',sig.event_type,'project_id',sig.project_id,'match_kind',kind,'relevance',score,
      'reason',reason,'occurred_at',sig.occurred_at,'linked_at',now()
    );

    if prior_status='waiting' then
      update public.minds_commitments
      set status='active',updated_at=now(),metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{last_continuity}',last_continuity,true)
      where id=c.id and user_id=p_user and status='waiting';
      if found then
        reactivated_count:=reactivated_count+1;
        insert into public.minds_commitment_events(user_id,commitment_id,event_type,body,from_status,to_status,source_kind,source,metadata)
        values(p_user,c.id,'reactivated','Cambio relevante: '||sig.title,'waiting','active',source_kind,
          jsonb_build_object('signal_id',sig.id,'source_id',sig.source_id,'fingerprint',sig.fingerprint),
          jsonb_build_object('match_kind',kind,'relevance',score,'reason',reason));
      end if;
    else
      update public.minds_commitments
      set updated_at=now(),metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{last_continuity}',last_continuity,true)
      where id=c.id and user_id=p_user;
      insert into public.minds_commitment_events(user_id,commitment_id,event_type,body,from_status,to_status,source_kind,source,metadata)
      values(p_user,c.id,'signal_linked','Cambio relevante: '||sig.title,prior_status,prior_status,source_kind,
        jsonb_build_object('signal_id',sig.id,'source_id',sig.source_id,'fingerprint',sig.fingerprint),
        jsonb_build_object('match_kind',kind,'relevance',score,'reason',reason));
    end if;
  end loop;

  return jsonb_build_object('signal_id',sig.id,'linked',linked_count,'reactivated',reactivated_count);
end $$;
revoke all on function public.minds_publish_continuity_signal(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_continuity_signal(uuid,jsonb) to service_role;

create or replace function public.minds_publish_heartbeat(p_user uuid,p_candidate jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.minds_heartbeat_events; fresh boolean:=false; sid uuid; continuity jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||(p_candidate->>'fingerprint'),0));
  select * into e from public.minds_heartbeat_events where user_id=p_user and fingerprint=p_candidate->>'fingerprint' for update;
  if not found then
    insert into public.minds_heartbeat_events(user_id,event_type,fingerprint,severity,title,body,project_id,source,metadata)
    values(p_user,p_candidate->>'event_type',p_candidate->>'fingerprint',coalesce(p_candidate->>'severity','attention'),p_candidate->>'title',coalesce(p_candidate->>'body',''),nullif(p_candidate->>'project_id','')::uuid,coalesce(p_candidate->'source','{}'),coalesce(p_candidate->'metadata','{}')) returning * into e;
    fresh:=true;
  else
    update public.minds_heartbeat_events set last_seen_at=now(),source=coalesce(p_candidate->'source','{}'),metadata=coalesce(p_candidate->'metadata','{}'),title=p_candidate->>'title',body=coalesce(p_candidate->>'body','') where id=e.id returning * into e;
  end if;
  if e.status='new' and coalesce((p_candidate->>'surface')::boolean,true) then
    insert into public.minds_surface_items(user_id,surface,agent,title,body,status,lifecycle_state,icon,generated_at,expires_at,metadata)
    values(p_user,'feed','isabella',p_candidate->>'title',coalesce(p_candidate->>'body',''),'active','new',case when p_candidate->>'severity'='urgent' then '!' else '·' end,now(),now()+make_interval(hours=>coalesce((p_candidate->>'ttl_hours')::integer,12)),jsonb_build_object('source','heartbeat','heartbeat_event_id',e.id,'event_type',e.event_type,'fingerprint',e.fingerprint,'project_id',e.project_id)) returning id into sid;
    update public.minds_heartbeat_events set status='surfaced',surfaced_at=now() where id=e.id;
  end if;
  continuity:=public.minds_publish_continuity_signal(p_user,jsonb_build_object(
    'source_kind','heartbeat','source_id',e.id::text,'fingerprint','heartbeat:'||e.fingerprint,
    'event_type',e.event_type,'title',e.title,'body',e.body,'project_id',e.project_id,
    'occurred_at',e.first_seen_at,'metadata',jsonb_build_object('heartbeat_event_id',e.id,'severity',e.severity)
  ));
  return jsonb_build_object('id',e.id,'created',fresh,'surfaced',sid is not null,'continuity',continuity);
end $$;
revoke all on function public.minds_publish_heartbeat(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_publish_heartbeat(uuid,jsonb) to service_role;
