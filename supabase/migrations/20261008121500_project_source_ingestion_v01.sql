-- Build 84.2 — source-first project ingestion receipts.
-- A source may be read many times, but one material version is ingested only once unless explicitly re-read.

create table if not exists public.minds_project_source_ingestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  source_kind text not null check (source_kind in ('work_file','thread_message','manual')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 240),
  source_version text not null check (length(trim(source_version)) between 1 and 256),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  model text null,
  referent_count integer not null default 0 check (referent_count>=0),
  claim_count integer not null default 0 check (claim_count>=0),
  extraction_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_metadata)='object'),
  error text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(user_id,project_id,source_kind,source_ref,source_version)
);

create index if not exists minds_project_source_ingestions_project_idx
  on public.minds_project_source_ingestions(user_id,project_id,created_at desc);

alter table public.minds_project_source_ingestions enable row level security;

drop policy if exists "project_source_ingestions_select_own" on public.minds_project_source_ingestions;
create policy "project_source_ingestions_select_own" on public.minds_project_source_ingestions
  for select to authenticated using ((select auth.uid())=user_id);

revoke all on public.minds_project_source_ingestions from anon,authenticated;
grant select on public.minds_project_source_ingestions to authenticated;
grant select,insert,update,delete on public.minds_project_source_ingestions to service_role;


create or replace function public.minds_commit_project_source_extraction(
  p_user_id uuid,
  p_project_id uuid,
  p_file_id uuid,
  p_source_version text,
  p_model text,
  p_referents jsonb,
  p_claims jsonb
)
returns jsonb
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_file public.minds_work_files%rowtype;
  v_ingestion public.minds_project_source_ingestions%rowtype;
  v_ref jsonb;
  v_claim jsonb;
  v_ref_id uuid;
  v_label text;
  v_kind text;
  v_statement text;
  v_claim_type text;
  v_conf numeric;
  v_excerpt text;
  v_referents integer:=0;
  v_claims integer:=0;
begin
  select * into v_file
  from public.minds_work_files
  where id=p_file_id and user_id=p_user_id and project_id=p_project_id;

  if not found then raise exception 'project_source_file_not_found'; end if;
  if nullif(trim(coalesce(p_source_version,'')),'') is null then raise exception 'source_version_required'; end if;

  select * into v_ingestion
  from public.minds_project_source_ingestions
  where user_id=p_user_id and project_id=p_project_id
    and source_kind='work_file' and source_ref=p_file_id::text and source_version=p_source_version
  for update;

  if found and v_ingestion.status='completed' then
    return jsonb_build_object(
      'status','already_indexed','ingestion_id',v_ingestion.id,
      'referent_count',v_ingestion.referent_count,'claim_count',v_ingestion.claim_count
    );
  end if;

  if not found then
    insert into public.minds_project_source_ingestions(
      user_id,project_id,source_kind,source_ref,source_version,status,model
    ) values (
      p_user_id,p_project_id,'work_file',p_file_id::text,p_source_version,'processing',nullif(p_model,'')
    )
    returning * into v_ingestion;
  else
    update public.minds_project_source_ingestions
    set status='processing',model=nullif(p_model,''),error=null,started_at=now(),completed_at=null
    where id=v_ingestion.id
    returning * into v_ingestion;
  end if;

  for v_ref in select value from jsonb_array_elements(coalesce(p_referents,'[]'::jsonb))
  loop
    v_label:=trim(coalesce(v_ref->>'label',''));
    if v_label='' then continue; end if;
    v_kind:=lower(trim(coalesce(v_ref->>'kind','other')));
    if v_kind not in ('person','organization','building_element','room','system','document','decision','meeting','phase','workstream','other') then
      v_kind:='other';
    end if;

    select id into v_ref_id
    from public.minds_project_referents
    where user_id=p_user_id and project_id=p_project_id and status='active'
      and kind=v_kind and lower(label)=lower(v_label)
    order by created_at asc limit 1;

    if v_ref_id is null then
      insert into public.minds_project_referents(
        user_id,project_id,kind,label,aliases,provenance
      ) values (
        p_user_id,p_project_id,v_kind,left(v_label,240),
        case when jsonb_typeof(v_ref->'aliases')='array' then v_ref->'aliases' else '[]'::jsonb end,
        jsonb_build_object(
          'class','source_first_extraction',
          'source_file_id',p_file_id,
          'source_version',p_source_version,
          'ingestion_id',v_ingestion.id,
          'model',p_model
        )
      ) returning id into v_ref_id;
      v_referents:=v_referents+1;
    end if;
    v_ref_id:=null;
  end loop;

  for v_claim in select value from jsonb_array_elements(coalesce(p_claims,'[]'::jsonb))
  loop
    v_statement:=trim(coalesce(v_claim->>'statement',''));
    if v_statement='' then continue; end if;
    v_claim_type:=lower(trim(coalesce(v_claim->>'claim_type','fact')));
    if v_claim_type not in ('fact','decision','requirement','deadline','dependency','open_question','assumption','constraint','other') then
      v_claim_type:='fact';
    end if;
    begin v_conf:=greatest(0,least(1,coalesce((v_claim->>'confidence')::numeric,0.7)));
    exception when others then v_conf:=0.7; end;
    v_excerpt:=nullif(trim(coalesce(v_claim->>'evidence_excerpt','')),'');

    v_ref_id:=null;
    v_label:=trim(coalesce(v_claim->>'referent_label',''));
    if v_label<>'' then
      select id into v_ref_id
      from public.minds_project_referents
      where user_id=p_user_id and project_id=p_project_id and status='active'
        and lower(label)=lower(v_label)
      order by created_at asc limit 1;
    end if;

    insert into public.minds_work_claims(
      user_id,project_id,claim_type,statement,subject,topic,discipline,status,confidence,
      provenance_class,referent_id,author_kind,model_kind,learned_at,metadata
    ) values (
      p_user_id,p_project_id,v_claim_type,left(v_statement,5000),
      nullif(left(trim(coalesce(v_claim->>'subject','')),500),''),
      nullif(left(trim(coalesce(v_claim->>'topic','')),500),''),
      nullif(left(trim(coalesce(v_claim->>'discipline','')),240),''),
      'proposed',v_conf,'project_source',v_ref_id,'external',null,now(),
      jsonb_build_object(
        'source_first',true,
        'source_file_id',p_file_id,
        'source_version',p_source_version,
        'ingestion_id',v_ingestion.id
      )
    )
    returning id into v_ref_id;

    insert into public.minds_work_evidence(
      user_id,project_id,claim_id,source_kind,source_file_id,locator,excerpt,stance,trust_level,metadata
    ) values (
      p_user_id,p_project_id,v_ref_id,'work_file',p_file_id,
      jsonb_build_object('extraction','source_first','source_version',p_source_version),
      v_excerpt,'supports','reported',
      jsonb_build_object('ingestion_id',v_ingestion.id,'model',p_model)
    );

    v_claims:=v_claims+1;
  end loop;

  update public.minds_project_source_ingestions
  set status='completed',referent_count=v_referents,claim_count=v_claims,
      extraction_metadata=jsonb_build_object('source_file_id',p_file_id,'source_version',p_source_version),
      completed_at=now()
  where id=v_ingestion.id
  returning * into v_ingestion;

  return jsonb_build_object(
    'status','completed','ingestion_id',v_ingestion.id,
    'referent_count',v_referents,'claim_count',v_claims
  );
exception when others then
  if v_ingestion.id is not null then
    update public.minds_project_source_ingestions
    set status='failed',error=left(sqlerrm,1600),completed_at=now()
    where id=v_ingestion.id;
  end if;
  raise;
end $$;

revoke all on function public.minds_commit_project_source_extraction(uuid,uuid,uuid,text,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.minds_commit_project_source_extraction(uuid,uuid,uuid,text,text,jsonb,jsonb)
  to service_role;
