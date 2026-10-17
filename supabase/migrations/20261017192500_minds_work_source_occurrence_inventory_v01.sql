-- Build 93.4 | Evidence-First Investigation: current-version, owner-only, exhaustive
-- explicit-term occurrence discovery. No updates to Work originals or Claims.
-- This tool enumerates EXTRACTED TEXT, never asserts visual/semantic completeness.
CREATE OR REPLACE FUNCTION public.minds_find_work_source_occurrences(
  p_project_id uuid,
  p_terms text[],
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_expected_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public','pg_temp'
AS $function$
WITH input AS (
 SELECT
  p_project_id IS NOT NULL
   AND coalesce(cardinality(p_terms),0) BETWEEN 1 AND 12
   AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p_terms,ARRAY[]::text[])) t
       WHERE length(trim(coalesce(t,''))) NOT BETWEEN 2 AND 120)
   AND coalesce(p_limit,25) BETWEEN 1 AND 50
   AND coalesce(p_offset,0) BETWEEN 0 AND 1000000
   AND (coalesce(p_offset,0)=0 OR length(coalesce(p_expected_fingerprint,''))=32)
   AND (p_expected_fingerprint IS NULL OR p_expected_fingerprint ~ '^[a-f0-9]{32}$') AS valid,
  coalesce(p_limit,25) AS page_size,coalesce(p_offset,0) AS page_offset
),
terms AS (
 SELECT DISTINCT lower(trim(t)) term FROM unnest(coalesce(p_terms,ARRAY[]::text[])) t
 WHERE length(trim(coalesce(t,''))) BETWEEN 2 AND 120
),
hits AS (
 SELECT s.file_id,f.name AS file_name,s.source_version,s.segment_no,s.segment_kind,
   s.locator,s.extractor,s.content,
   (SELECT min(strpos(lower(s.content),t.term)) FROM terms t
      WHERE strpos(lower(s.content),t.term)>0) AS first_match
 FROM public.minds_work_source_segments s
 JOIN public.minds_work_files f ON f.id=s.file_id
   AND f.user_id=s.user_id AND f.project_id=s.project_id
 WHERE s.project_id=p_project_id
   AND s.user_id=(SELECT auth.uid())
   AND f.user_id=(SELECT auth.uid())
   AND s.source_version=coalesce(f.metadata->'knowledge_intake'->>'source_version','')
   AND EXISTS(SELECT 1 FROM terms t WHERE strpos(lower(s.content),t.term)>0)
),
scan AS (
 SELECT count(*)::integer AS total,
   md5(coalesce(string_agg(h.file_id::text||':'||h.source_version||':'||h.segment_no::text,
     '|' ORDER BY h.file_id,h.segment_no),'') || '|' ||
     coalesce((SELECT string_agg(term,'|' ORDER BY term) FROM terms),'')) AS fingerprint
 FROM hits h
),
page AS (
 SELECT h.file_id,h.file_name,h.source_version,h.segment_no,h.segment_kind,h.locator,
    h.extractor,length(h.content) AS segment_chars,
    substring(h.content from greatest(1,h.first_match-120) for 960) AS match_excerpt,
    h.first_match AS first_match_char
 FROM hits h
 ORDER BY h.file_id,h.segment_no
 LIMIT (SELECT greatest(1,least(page_size,50)) FROM input)
 OFFSET (SELECT greatest(0,page_offset) FROM input)
),
pack AS (
 SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.file_id,page.segment_no),
   '[]'::jsonb) AS matches,count(*)::integer AS returned FROM page
)
SELECT CASE
 WHEN NOT (SELECT valid FROM input)
  THEN jsonb_build_object('status','invalid','reason','invalid_terms_or_cursor')
 WHEN p_expected_fingerprint IS NOT NULL
   AND p_expected_fingerprint<>(SELECT fingerprint FROM scan)
  THEN jsonb_build_object('status','version_changed',
   'total',(SELECT total FROM scan),'fingerprint',(SELECT fingerprint FROM scan),
   'matches','[]'::jsonb,'has_more',false)
 ELSE jsonb_build_object(
   'status','ok',
   'scope','all_current_extracted_text_matching_explicit_terms',
   'terms',(SELECT coalesce(jsonb_agg(term ORDER BY term),'[]'::jsonb) FROM terms),
   'total',(SELECT total FROM scan),
   'fingerprint',(SELECT fingerprint FROM scan),
   'offset',(SELECT page_offset FROM input),
   'limit',(SELECT page_size FROM input),
   'returned',(SELECT returned FROM pack),
   'has_more',(SELECT page_offset FROM input)+(SELECT returned FROM pack)<(SELECT total FROM scan),
   'next_offset',CASE WHEN (SELECT page_offset FROM input)+(SELECT returned FROM pack)<(SELECT total FROM scan)
     THEN (SELECT page_offset FROM input)+(SELECT returned FROM pack) ELSE NULL END,
   'matches',(SELECT matches FROM pack),
   'extraction_gaps_are_separate',true,
   'full_originals_verified',false)
 END;
$function$;

REVOKE ALL ON FUNCTION public.minds_find_work_source_occurrences(uuid,text[],integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.minds_find_work_source_occurrences(uuid,text[],integer,integer,text) TO authenticated;
COMMENT ON FUNCTION public.minds_find_work_source_occurrences(uuid,text[],integer,integer,text) IS
  'Read-only owner-scoped current-version explicit text occurrence inventory with stable cursor hash, exact count and locators. Distinct from semantic search and original-image verification.';
