-- Preserve the required category shared by the owner's existing Work projects.
create or replace function public.minds_enable_window_review_v1() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); p uuid; c uuid; category_count integer;
begin
 if u is null then raise exception 'auth_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':window_review',42));
 select project_id into p from public.minds_self_review_settings where user_id=u;
 if p is null then
  select id into p from public.isabella_projects where user_id=u and lower(name)='window' and not archived order by created_at limit 1;
  if p is null then
   select count(distinct category_id) into category_count from public.isabella_projects where user_id=u and not archived;
   if category_count<>1 then raise exception 'window_category_requires_selection';end if;
   select category_id into c from public.isabella_projects where user_id=u and not archived order by created_at limit 1;
   insert into public.isabella_projects(user_id,category_id,client_key,name,archived) values(u,c,'window','Window',false) returning id into p;
  end if;
  insert into public.minds_self_review_settings(user_id,project_id) values(u,p);
 else
  update public.minds_self_review_settings set enabled=true where user_id=u;
 end if;
 return jsonb_build_object('project_id',p,'enabled',true,'timezone','Europe/Berlin','local_hour',4);
end $$;
revoke all on function public.minds_enable_window_review_v1() from public,anon;
grant execute on function public.minds_enable_window_review_v1() to authenticated;

