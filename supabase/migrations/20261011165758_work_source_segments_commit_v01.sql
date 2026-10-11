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
 on conflict(file_id,source_version) do nothing
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

