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
