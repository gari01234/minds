-- #113: do not retrieve stale source text after replacing or re-ingesting a Work file.
-- Version comes from the current canonical original's source-intake metadata.
-- Existing RLS/auth.uid() remains the owner boundary; original files are untouched.
CREATE OR REPLACE FUNCTION public.minds_search_work_source_segments(
  p_project_id uuid,p_query text,p_limit integer DEFAULT 12
)
RETURNS TABLE(file_id uuid,file_name text,source_version text,segment_no integer,
  segment_kind text,locator jsonb,content text,extractor text)
LANGUAGE sql STABLE SET search_path TO 'public','pg_temp'
AS $function$
WITH terms AS (
  SELECT DISTINCT lower(word) w
  FROM regexp_split_to_table(left(coalesce(p_query,''),500),'[^[:alnum:]äöüßáéíóúñ]+') word
  WHERE length(word)>=4 AND lower(word) NOT IN
    ('sobre','como','para','cuál','donde','archivo','documento','bernried',
     'schwarz','work','dice','explica','tiene','document','file')
  LIMIT 12
), scored AS (
  SELECT s.file_id,f.name file_name,s.source_version,s.segment_no,s.segment_kind,
    s.locator,s.content,s.extractor,
    (SELECT count(*) FROM terms WHERE strpos(lower(s.content),w)>0) content_hits,
    (SELECT count(*) FROM terms WHERE strpos(lower(f.name),w)>0) filename_hits,
    position(lower(f.name) in lower(coalesce(p_query,'')))>0 named_file
  FROM public.minds_work_source_segments s
  JOIN public.minds_work_files f ON f.id=s.file_id AND f.user_id=s.user_id
  WHERE s.project_id=p_project_id AND s.user_id=(SELECT auth.uid())
    AND s.source_version=coalesce(f.metadata->'knowledge_intake'->>'source_version','')
)
SELECT file_id,file_name,source_version,segment_no,segment_kind,locator,content,extractor
FROM scored
WHERE content_hits>0 OR filename_hits>0 OR named_file
ORDER BY named_file DESC,(content_hits*2+filename_hits) DESC,file_name,segment_no
LIMIT greatest(1,least(coalesce(p_limit,12),16));
$function$;
COMMENT ON FUNCTION public.minds_search_work_source_segments(uuid,text,integer) IS
  'Owner-only Work text search; only current source version and evidence-preserving locators, not old uploads.';
