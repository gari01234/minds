
alter table public.isabella_tasks alter column due_date drop not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'isabella-uploads',
  'isabella-uploads',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "isabella uploads select own" on storage.objects;
create policy "isabella uploads select own"
on storage.objects for select
to authenticated
using (
  bucket_id='isabella-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "isabella uploads insert own" on storage.objects;
create policy "isabella uploads insert own"
on storage.objects for insert
to authenticated
with check (
  bucket_id='isabella-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "isabella uploads delete own" on storage.objects;
create policy "isabella uploads delete own"
on storage.objects for delete
to authenticated
using (
  bucket_id='isabella-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
