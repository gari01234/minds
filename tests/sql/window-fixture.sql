-- Synthetic local database only. Cron records a schedule without networking.
create schema auth;
create schema cron;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated;
grant execute on function auth.uid() to authenticated;
create table public.isabella_projects(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),name text not null,client_key text not null,archived boolean not null default false,created_at timestamptz default now(),unique(user_id,client_key));
create table public.isabella_runtime_secrets(key text primary key,value text not null);
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
