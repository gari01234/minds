-- Knowledge Coverage 0.6: document text segments are evidence, not authoritative Claims.
-- Canonical originals remain in minds-work Storage / minds_work_files.
create table if not exists public.minds_work_source_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.isabella_projects(id) on delete cascade,
  file_id uuid not null references public.minds_work_files(id) on delete cascade,
  source_version text not null check(length(source_version)=64),
  segment_no integer not null check(segment_no between 0 and 249),
  segment_kind text not null check(segment_kind in ('sheet_rows','page_text','unpaged_text')),
  locator jsonb not null default '{}'::jsonb check(jsonb_typeof(locator)='object'),
  content text not null check(length(content) between 1 and 6500),
  extractor text not null,
  created_at timestamptz not null default now(),
  unique(file_id,source_version,segment_no)
);
create index if not exists minds_work_source_segments_project_idx
 on public.minds_work_source_segments(user_id,project_id,file_id,segment_no);
create index if not exists minds_work_source_segments_text_idx
 on public.minds_work_source_segments using gin(to_tsvector('simple',content));
alter table public.minds_work_source_segments enable row level security;
revoke all on public.minds_work_source_segments from public,anon,authenticated;
grant select on public.minds_work_source_segments to authenticated;
grant select,insert,update,delete on public.minds_work_source_segments to service_role;
create policy minds_work_source_segments_owner_select
 on public.minds_work_source_segments for select to authenticated
 using(user_id=(select auth.uid()));

create table if not exists public.minds_work_source_text_receipts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.isabella_projects(id) on delete cascade,
 file_id uuid not null references public.minds_work_files(id) on delete cascade,
 source_version text not null check(length(source_version)=64),
 extractor text not null,
 coverage text not null check(coverage in ('complete_text','partial_text')),
 segment_count integer not null check(segment_count between 1 and 250),
 content_chars integer not null check(content_chars>0),
 locator_class text not null check(locator_class in ('worksheet_rows','pdf_page','unverified_page')),
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_at timestamptz not null default now(),
 unique(file_id,source_version,extractor)
);
alter table public.minds_work_source_text_receipts enable row level security;
revoke all on public.minds_work_source_text_receipts from public,anon,authenticated;
grant select on public.minds_work_source_text_receipts to authenticated;
grant select,insert,update,delete on public.minds_work_source_text_receipts to service_role;
create policy minds_work_source_text_receipts_owner_select
 on public.minds_work_source_text_receipts for select to authenticated
 using(user_id=(select auth.uid()));

-- Atomic, bounded, service-only materialization of a single source version.
create or replace function public.minds_commit_work_source_segments(
 p_user_id uuid,p_project_id uuid,p_file_id uuid,p_source_version text,
 p_extractor text,p_coverage text,p_locator_class text,p_metadata jsonb,p_segments jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_count integer;
 v_row jsonb;
 v_idx integer;
 v_text text;
 v_kind text;
 v_loc jsonb;
 v_chars integer:=0;
 v_receipt uuid;
begin
 if not exists(select 1 from public.minds_work_files
   where id=p_file_id and user_id=p_user_id and project_id=p_project_id)
   then raise exception 'source_file_not_owned'; end if;
 if length(coalesce(p_source_version,''))<>64
   or p_source_version!~'^[0-9a-f]{64}$' then raise exception 'invalid_source_version'; end if;
 if p_coverage not in ('complete_text','partial_text') or p_locator_class not in
   ('worksheet_rows','pdf_page','unverified_page') then raise exception 'invalid_coverage'; end if;
 if jsonb_typeof(p_segments)<> 'array' then raise exception 'invalid_segments'; end if;
 v_count:=jsonb_array_length(p_segments);
 if v_count<1 or v_count>250 then raise exception 'segment_count_out_of_bounds'; end if;
 if coalesce(length(p_extractor),0) not between 1 and 100 then raise exception 'invalid_extractor'; end if;
 for v_row in select value from jsonb_array_elements(p_segments) loop
   v_idx:=(v_row->>'segment_no')::integer;
   v_kind:=v_row->>'segment_kind';
   v_text:=v_row->>'content';
   v_loc:=v_row->'locator';
   if v_idx<0 or v_idx>=v_count or v_kind not in
     ('sheet_rows','page_text','unpaged_text') or length(coalesce(v_text,'')) not between 1 and 6500
     or jsonb_typeof(v_loc)<>'object' then raise exception 'invalid_segment'; end if;
   v_chars:=v_chars+length(v_text);
 end loop;
 -- A verified receipt must never be replaced with fewer segments by a retry.
 insert into public.minds_work_source_text_receipts(
  user_id,project_id,file_id,source_version,extractor,coverage,segment_count,content_chars,locator_class,metadata)
 values(p_user_id,p_project_id,p_file_id,p_source_version,p_extractor,p_coverage,v_count,v_chars,p_locator_class,coalesce(p_metadata,'{}'::jsonb))
 on conflict(file_id,source_version,extractor) do nothing
 returning id into v_receipt;
 if v_receipt is null then
   return jsonb_build_object('status','already_materialized');
 end if;
 for v_row in select value from jsonb_array_elements(p_segments) loop
   insert into public.minds_work_source_segments(
     user_id,project_id,file_id,source_version,segment_no,segment_kind,locator,content,extractor)
   values(p_user_id,p_project_id,p_file_id,p_source_version,
     (v_row->>'segment_no')::integer,v_row->>'segment_kind',v_row->'locator',v_row->>'content',p_extractor)
   on conflict(file_id,source_version,segment_no) do nothing;
 end loop;
 return jsonb_build_object('status','completed','segments',v_count,'chars',v_chars);
end $$;
revoke all on function public.minds_commit_work_source_segments(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.minds_commit_work_source_segments(uuid,uuid,uuid,text,text,text,text,jsonb,jsonb)
 to service_role;

-- Authenticated Search uses RLS AND a second explicit owner check.
create or replace function public.minds_search_work_source_segments(
 p_project_id uuid,p_query text,p_limit integer default 12
) returns table(file_id uuid,file_name text,source_version text,
 segment_no integer,segment_kind text,locator jsonb,content text,extractor text)
 language sql stable security invoker set search_path=public,pg_temp as $$
 with terms as (
   select distinct lower(word) w
   from regexp_split_to_table(left(coalesce(p_query,''),500),'[^[:alnum:]äöüßáéíóúñ]+') word
   where length(word)>=4 and lower(word) not in
     ('sobre','como','para','cuál','donde','archivo','documento','bernried','schwarz','work','dice','explica','tiene','document','file')
   limit 12
 ), scored as (
   select s.file_id,f.name file_name,s.source_version,s.segment_no,s.segment_kind,
     s.locator,s.content,s.extractor,
     (select count(*) from terms where strpos(lower(s.content),w)>0) as content_hits,
     (select count(*) from terms where strpos(lower(f.name),w)>0) as filename_hits,
     position(lower(f.name) in lower(coalesce(p_query,'')))>0 as named_file
   from public.minds_work_source_segments s
   join public.minds_work_files f on f.id=s.file_id and f.user_id=s.user_id
   where s.project_id=p_project_id and s.user_id=(select auth.uid())
 )
 select file_id,file_name,source_version,segment_no,segment_kind,locator,content,extractor
 from scored
 where content_hits>0 or filename_hits>0 or named_file
 order by named_file desc, (content_hits*2+filename_hits) desc, file_name,segment_no
 limit greatest(1,least(coalesce(p_limit,12),16))
$$;
revoke all on function public.minds_search_work_source_segments(uuid,text,integer) from public,anon;
grant execute on function public.minds_search_work_source_segments(uuid,text,integer) to authenticated;
