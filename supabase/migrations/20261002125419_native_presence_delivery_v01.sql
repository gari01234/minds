-- Build 71 — Native Presence & Delivery Layer v0.1
-- Web Push transport is downstream of Attention Economy. It never decides attention policy.

create table if not exists public.minds_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint null,
  user_agent text null,
  platform text null,
  display_mode text null,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,endpoint),
  constraint minds_push_subscriptions_endpoint_check check (endpoint ~ '^https://'),
  constraint minds_push_subscriptions_keys_check check (length(p256dh) between 20 and 1000 and length(auth_key) between 8 and 500)
);

create index if not exists minds_push_subscriptions_user_active_idx
  on public.minds_push_subscriptions(user_id,active,last_seen_at desc);

alter table public.minds_push_subscriptions enable row level security;
drop policy if exists "push subscriptions select own" on public.minds_push_subscriptions;
create policy "push subscriptions select own"
on public.minds_push_subscriptions for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_push_subscriptions from authenticated,anon;
grant select on public.minds_push_subscriptions to authenticated;
grant all on public.minds_push_subscriptions to service_role;

create table if not exists public.minds_delivery_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attention_event_id uuid not null references public.minds_attention_events(id) on delete cascade,
  channel text not null default 'web_push' check (channel in ('web_push')),
  status text not null default 'pending' check (status in ('pending','processing','retry','sent','failed','skipped')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  lease_token uuid null,
  lease_until timestamptz null,
  last_error text null,
  sent_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attention_event_id,channel)
);

create index if not exists minds_delivery_intents_claim_idx
  on public.minds_delivery_intents(status,next_attempt_at,created_at);
create index if not exists minds_delivery_intents_user_idx
  on public.minds_delivery_intents(user_id,created_at desc);

alter table public.minds_delivery_intents enable row level security;
drop policy if exists "delivery intents select own" on public.minds_delivery_intents;
create policy "delivery intents select own"
on public.minds_delivery_intents for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_delivery_intents from authenticated,anon;
grant select on public.minds_delivery_intents to authenticated;
grant all on public.minds_delivery_intents to service_role;

create table if not exists public.minds_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  intent_id uuid not null references public.minds_delivery_intents(id) on delete cascade,
  subscription_id uuid null references public.minds_push_subscriptions(id) on delete set null,
  status text not null check (status in ('accepted','gone','failed')),
  http_status integer null,
  error text null,
  endpoint_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists minds_delivery_attempts_user_idx
  on public.minds_delivery_attempts(user_id,created_at desc);
create index if not exists minds_delivery_attempts_intent_idx
  on public.minds_delivery_attempts(intent_id,created_at desc);

alter table public.minds_delivery_attempts enable row level security;
drop policy if exists "delivery attempts select own" on public.minds_delivery_attempts;
create policy "delivery attempts select own"
on public.minds_delivery_attempts for select to authenticated
using ((select auth.uid())=user_id);
revoke insert,update,delete on public.minds_delivery_attempts from authenticated,anon;
grant select on public.minds_delivery_attempts to authenticated;
grant all on public.minds_delivery_attempts to service_role;

create or replace function public.minds_register_push_subscription(
  p_subscription jsonb,
  p_device jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_endpoint text:=trim(coalesce(p_subscription->>'endpoint',''));
  v_p256dh text:=trim(coalesce(p_subscription->'keys'->>'p256dh',''));
  v_auth text:=trim(coalesce(p_subscription->'keys'->>'auth',''));
  v_exp bigint:=nullif(p_subscription->>'expirationTime','')::bigint;
  v_row public.minds_push_subscriptions;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if v_endpoint !~ '^https://' or length(v_endpoint)>4000 then raise exception 'invalid push endpoint'; end if;
  if length(v_p256dh)<20 or length(v_auth)<8 then raise exception 'invalid push subscription keys'; end if;

  insert into public.minds_push_subscriptions(
    user_id,endpoint,p256dh,auth_key,expiration_time,user_agent,platform,display_mode,active,last_seen_at
  ) values (
    v_user,v_endpoint,v_p256dh,v_auth,v_exp,
    left(nullif(p_device->>'user_agent',''),1000),
    left(nullif(p_device->>'platform',''),200),
    left(nullif(p_device->>'display_mode',''),100),
    true,now()
  )
  on conflict(user_id,endpoint) do update set
    p256dh=excluded.p256dh,
    auth_key=excluded.auth_key,
    expiration_time=excluded.expiration_time,
    user_agent=excluded.user_agent,
    platform=excluded.platform,
    display_mode=excluded.display_mode,
    active=true,
    last_seen_at=now(),
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object('status','ok','id',v_row.id,'active',v_row.active);
end $$;

create or replace function public.minds_remove_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_count integer:=0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  update public.minds_push_subscriptions
  set active=false,updated_at=now()
  where user_id=v_user and endpoint=p_endpoint and active;
  get diagnostics v_count=row_count;
  return jsonb_build_object('status','ok','deactivated',v_count);
end $$;

revoke all on function public.minds_register_push_subscription(jsonb,jsonb) from public,anon;
revoke all on function public.minds_remove_push_subscription(text) from public,anon;
grant execute on function public.minds_register_push_subscription(jsonb,jsonb) to authenticated;
grant execute on function public.minds_remove_push_subscription(text) to authenticated;

create or replace function public.minds_store_vapid_pair_if_absent(p_public text,p_private text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_public text;
  v_private text;
begin
  if length(trim(coalesce(p_public,'')))<20 or length(trim(coalesce(p_private,'')))<20 then
    raise exception 'invalid vapid pair';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('minds:webpush:vapid',0));
  select value into v_public from public.isabella_runtime_secrets where key='push_vapid_public';
  select value into v_private from public.isabella_runtime_secrets where key='push_vapid_private';

  if v_public is null or v_private is null then
    insert into public.isabella_runtime_secrets(key,value)
    values ('push_vapid_public',p_public),('push_vapid_private',p_private)
    on conflict(key) do update set value=excluded.value;
    v_public:=p_public;
    v_private:=p_private;
  end if;

  return jsonb_build_object('public_key',v_public,'private_key',v_private);
end $$;

revoke all on function public.minds_store_vapid_pair_if_absent(text,text) from public,anon,authenticated;
grant execute on function public.minds_store_vapid_pair_if_absent(text,text) to service_role;

create or replace function public.minds_enqueue_push_from_attention()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.route<>'interrupt' or new.status<>'delivered' then return new; end if;
  if tg_op='UPDATE' then
    if old.status='delivered' then return new; end if;
  end if;
  if not exists(
    select 1 from public.minds_push_subscriptions
    where user_id=new.user_id and active
  ) then return new; end if;

  insert into public.minds_delivery_intents(
    user_id,attention_event_id,channel,status,payload,next_attempt_at,expires_at
  ) values (
    new.user_id,new.id,'web_push','pending',
    jsonb_build_object(
      'attention_event_id',new.id,
      'event_type',new.event_type,
      'title',new.title,
      'body',new.body,
      'reason_code',new.reason_code,
      'source_type',new.source_type,
      'source_id',new.source_id,
      'requires_user',new.requires_user,
      'user_requested',new.user_requested,
      'url','/minds/isabella/?attention='||new.id::text
    )||new.metadata,
    now(),
    coalesce(new.deadline_at+interval '2 hours',now()+interval '24 hours')
  )
  on conflict(attention_event_id,channel) do nothing;
  return new;
end $$;

revoke all on function public.minds_enqueue_push_from_attention() from public,anon,authenticated;

drop trigger if exists minds_attention_enqueue_push on public.minds_attention_events;
create trigger minds_attention_enqueue_push
after insert or update of status,route on public.minds_attention_events
for each row
when (new.route='interrupt' and new.status='delivered')
execute function public.minds_enqueue_push_from_attention();

create or replace function public.minds_claim_delivery_intents(p_limit integer default 12)
returns setof public.minds_delivery_intents
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.minds_delivery_intents
  set status='skipped',last_error='expired',lease_token=null,lease_until=null,updated_at=now()
  where status in ('pending','retry','processing') and expires_at<=now();

  return query
  with picked as (
    select id
    from public.minds_delivery_intents
    where expires_at>now()
      and next_attempt_at<=now()
      and (
        status in ('pending','retry')
        or (status='processing' and lease_until<now())
      )
    order by created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,12),50))
  )
  update public.minds_delivery_intents d
  set status='processing',
      attempt_count=d.attempt_count+1,
      lease_token=gen_random_uuid(),
      lease_until=now()+interval '3 minutes',
      updated_at=now()
  from picked
  where d.id=picked.id
  returning d.*;
end $$;

create or replace function public.minds_finish_delivery_intent(
  p_intent_id uuid,
  p_lease_token uuid,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_intent public.minds_delivery_intents;
  v_result jsonb;
  v_accepted integer:=0;
  v_failed integer:=0;
  v_gone integer:=0;
  v_status text;
  v_error text:=null;
  v_delay integer:=5;
begin
  if jsonb_typeof(coalesce(p_results,'[]'::jsonb))<>'array' then raise exception 'results must be array'; end if;

  select * into v_intent
  from public.minds_delivery_intents
  where id=p_intent_id and lease_token=p_lease_token and status='processing'
  for update;
  if not found then return jsonb_build_object('status','stale'); end if;

  for v_result in select value from jsonb_array_elements(coalesce(p_results,'[]'::jsonb))
  loop
    if v_result->>'status'='accepted' then v_accepted:=v_accepted+1;
    elsif v_result->>'status'='gone' then v_gone:=v_gone+1;
    else v_failed:=v_failed+1; end if;

    insert into public.minds_delivery_attempts(
      user_id,intent_id,subscription_id,status,http_status,error,endpoint_hash
    ) values (
      v_intent.user_id,
      v_intent.id,
      nullif(v_result->>'subscription_id','')::uuid,
      case when v_result->>'status' in ('accepted','gone','failed') then v_result->>'status' else 'failed' end,
      nullif(v_result->>'http_status','')::integer,
      left(nullif(v_result->>'error',''),2000),
      left(nullif(v_result->>'endpoint_hash',''),128)
    );

    if v_result->>'status'='gone' and nullif(v_result->>'subscription_id','') is not null then
      update public.minds_push_subscriptions
      set active=false,updated_at=now()
      where id=(v_result->>'subscription_id')::uuid and user_id=v_intent.user_id;
    end if;
  end loop;

  if v_accepted>0 then
    v_status:='sent';
  elsif not exists(select 1 from public.minds_push_subscriptions where user_id=v_intent.user_id and active) then
    v_status:='skipped';
    v_error:='no_active_subscription';
  elsif v_intent.attempt_count<4 and v_intent.expires_at>now() then
    v_status:='retry';
    v_delay:=least(60,5*cast(power(2,greatest(0,v_intent.attempt_count-1)) as integer));
    v_error:=case when v_failed>0 then 'push_failed' else 'no_delivery_accepted' end;
  else
    v_status:='failed';
    v_error:=case when v_failed>0 then 'push_failed' else 'delivery_exhausted' end;
  end if;

  update public.minds_delivery_intents
  set status=v_status,
      next_attempt_at=case when v_status='retry' then now()+make_interval(mins=>v_delay) else next_attempt_at end,
      sent_at=case when v_status='sent' then now() else sent_at end,
      last_error=v_error,
      lease_token=null,
      lease_until=null,
      metadata=metadata||jsonb_build_object('accepted',v_accepted,'gone',v_gone,'failed',v_failed),
      updated_at=now()
  where id=v_intent.id;

  return jsonb_build_object(
    'status',v_status,
    'accepted',v_accepted,
    'gone',v_gone,
    'failed',v_failed,
    'retry_minutes',case when v_status='retry' then v_delay else null end
  );
end $$;

revoke all on function public.minds_claim_delivery_intents(integer) from public,anon,authenticated;
revoke all on function public.minds_finish_delivery_intent(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minds_claim_delivery_intents(integer) to service_role;
grant execute on function public.minds_finish_delivery_intent(uuid,uuid,jsonb) to service_role;

insert into public.isabella_runtime_secrets(key,value)
values ('delivery_runner',encode(gen_random_bytes(32),'hex'))
on conflict(key) do nothing;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='minds-delivery-runner' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'minds-delivery-runner',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://lodexwyyynlarkqgkyhy.supabase.co/functions/v1/isabella-delivery-runner',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'secret',
      (select value from public.isabella_runtime_secrets where key='delivery_runner')
    )
  );
  $cron$
);
