-- P0 #138.2: explicit, bounded origin evidence for owned calendar tasks.
-- No migration of legacy messages or weakening of scoped-history policies.
-- No new source of truth, no write-through and no grants beyond read-only RPC.
create or replace function public.minds_read_task_origin_v01(p_task_ref text)
returns table(
  task_id uuid,
  source_message_id uuid,
  source_text text,
  source_created_at timestamptz,
  match_method text,
  evidence_status text
)
language sql stable security invoker
set search_path = 'public'
as $fn$
  with owned_task as (
    select t.id,t.title,t.created_at,t.project_id,t.user_id
    from public.isabella_tasks t
    where auth.uid() is not null and t.user_id=auth.uid()
      and (t.id::text=trim(coalesce(p_task_ref,''))
           or t.client_key=trim(coalesce(p_task_ref,'')))
      and t.metadata->>'source'='isabella'
      and length(trim(t.title)) between 3 and 180
    limit 1
  ),
  current_conversation as (
    select c.id
    from public.conversations c
    where c.user_id=auth.uid() and c.app_scope='isabella'
    order by c.updated_at desc,c.id desc
    limit 1
  ),
  candidates as (
    select
      t.id as task_id,
      m.id as source_message_id,
      left(m.content,600) as source_text,
      m.created_at as source_created_at,
      count(*) over(partition by t.id) as candidate_count,
      row_number() over(partition by t.id order by
        abs(extract(epoch from (m.created_at-t.created_at))) asc,m.id asc) as candidate_rank
    from owned_task t
    join current_conversation c on true
    join public.conversation_messages m
      on m.user_id=auth.uid() and m.conversation_id=c.id
     and m.role='user'
     and m.created_at between t.created_at-interval '10 minutes'
                          and t.created_at+interval '2 minutes'
     and strpos(lower(m.content),lower(t.title))>0
     and (
       (m.exposure_scope_version=0 and m.exposure_scope_key='legacy')
       or
       (m.exposure_scope_version=1 and
         (m.exposure_scope_key='global'
          or (t.project_id is not null and
              m.exposure_scope_key='project:'||t.project_id::text)))
     )
  )
  select c.task_id,c.source_message_id,c.source_text,c.source_created_at,
         'unique_title_creation_window'::text,
         'inferred_origin_candidate'::text
  from candidates c
  where c.candidate_rank=1 and c.candidate_count=1;
$fn$;

revoke all on function public.minds_read_task_origin_v01(text) from public,anon;
grant execute on function public.minds_read_task_origin_v01(text) to authenticated;
comment on function public.minds_read_task_origin_v01(text) is
 'Read-only, owner-scoped, uniquely inferred task-origin evidence; never promotes legacy conversation scope or accepted truth.';
