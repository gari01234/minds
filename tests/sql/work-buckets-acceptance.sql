-- Exact production migration tested against synthetic owner-scoped rows.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  moved integer;
begin
  select public.minds_work_bucket_reorder('33333333-3333-4333-8333-333333333333',
    array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid]) into moved;
  if moved<>3 or
    (select sort_order from public.minds_work_buckets where name='C')<>0 or
    (select sort_order from public.minds_work_buckets where name='A')<>10 or
    (select sort_order from public.minds_work_buckets where name='B')<>20 then
    raise exception 'Reordering did not persist precise order';
  end if;
  begin
    perform public.minds_work_bucket_reorder('33333333-3333-4333-8333-333333333333',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid]);
    raise exception 'Duplicate order should fail';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.minds_work_bucket_reorder('33333333-3333-4333-8333-333333333333',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid]);
    raise exception 'Cross-project order should fail';
  exception when sqlstate '22023' then null;
  end;
  select public.minds_work_bucket_archive(
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') into moved;
  if moved<>2 then raise exception 'Archive did not move both tasks'; end if;
  if (select count(*) from public.isabella_tasks where work_bucket_id is null)<>2 then
    raise exception 'Tasks not unbucketed';
  end if;
  if (select count(*) from public.isabella_tasks)<>3 then
    raise exception 'Tasks were deleted';
  end if;
  if not (select archived from public.minds_work_buckets where name='B') then
    raise exception 'Bucket not archived';
  end if;
  if (select work_bucket_id from public.isabella_tasks where title='another project')
       <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid then
    raise exception 'Other project task changed';
  end if;
  begin
    perform public.minds_work_bucket_archive(
      '33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
    raise exception 'Second archive should fail';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.minds_work_bucket_archive(
      '33333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    raise exception 'Another user could archive private bucket';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.minds_work_bucket_reorder(
      '33333333-3333-4333-8333-333333333333',
      array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid]);
    raise exception 'Another user could reorder private buckets';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
do $$
begin
  if pg_catalog.has_function_privilege('anon','public.minds_work_bucket_archive(uuid,uuid)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.minds_work_bucket_reorder(uuid,uuid[])','EXECUTE')
  then raise exception 'Unauthenticated role has RPC permission'; end if;
end $$;
select 'Work Bucket SQL acceptance PASS' as result;
