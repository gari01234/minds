-- Build 71 behavioral contract. All device and delivery fixtures roll back.
begin;

insert into auth.users(id,aud,role,email) values
 ('f1000000-0000-4000-8000-000000000071','authenticated','authenticated','push-a@example.invalid'),
 ('f1000000-0000-4000-8000-000000000072','authenticated','authenticated','push-b@example.invalid');

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000071',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare x jsonb;
begin
 x:=public.minds_register_push_subscription(
   '{"endpoint":"https://push.example.invalid/subscription-a","expirationTime":null,"keys":{"p256dh":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","auth":"AAAAAAAAAAAAAAAAAAAAAA"}}'::jsonb,
   '{"platform":"TEST","display_mode":"standalone","user_agent":"MINDS TEST"}'::jsonb
 );
 if x->>'status'<>'ok' then raise exception 'TEST subscription registration';end if;
 if not exists(select 1 from public.minds_push_subscriptions where active and platform='TEST') then raise exception 'TEST own subscription read';end if;
 if has_table_privilege('authenticated','public.minds_push_subscriptions','INSERT') then raise exception 'TEST direct subscription insert exposed';end if;
 if has_function_privilege('anon','public.minds_register_push_subscription(jsonb,jsonb)','EXECUTE') then raise exception 'TEST anonymous subscription register';end if;
 if has_function_privilege('authenticated','public.minds_claim_delivery_intents(integer)','EXECUTE') then raise exception 'TEST delivery claim exposed';end if;
 if has_function_privilege('authenticated','public.minds_store_vapid_pair_if_absent(text,text)','EXECUTE') then raise exception 'TEST VAPID private store exposed';end if;
end $$;

reset role;

insert into public.minds_attention_events(
 user_id,event_key,source_type,event_type,title,body,urgency,route,reason_code,reason,policy_version,status
) values (
 'f1000000-0000-4000-8000-000000000071','TEST PUSH INTERRUPT','system','upcoming_event','Reunión en breve','Empieza pronto.','attention','interrupt','imminent_event','TEST','attention_v1','delivered'
);

do $$
declare n integer;
begin
 select count(*) into n from public.minds_delivery_intents
 where user_id='f1000000-0000-4000-8000-000000000071' and channel='web_push';
 if n<>1 then raise exception 'TEST interrupt did not enqueue exactly one delivery intent: %',n;end if;

 update public.minds_attention_events
 set status='delivered'
 where user_id='f1000000-0000-4000-8000-000000000071' and event_key='TEST PUSH INTERRUPT';

 select count(*) into n from public.minds_delivery_intents
 where user_id='f1000000-0000-4000-8000-000000000071' and channel='web_push';
 if n<>1 then raise exception 'TEST duplicate attention update duplicated intent';end if;
end $$;

insert into public.minds_attention_events(
 user_id,event_key,source_type,event_type,title,body,urgency,route,reason_code,reason,policy_version,status
) values (
 'f1000000-0000-4000-8000-000000000071','TEST PUSH BRIEFING','system','mission_completed','Trabajo terminado','Terminé.','attention','briefing','mission_completed','TEST','attention_v1','pending'
);

do $$
begin
 if exists(select 1 from public.minds_delivery_intents d join public.minds_attention_events a on a.id=d.attention_event_id where a.event_key='TEST PUSH BRIEFING') then
   raise exception 'TEST delivery layer overrode attention route';
 end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000072',true);
do $$
begin
 if exists(select 1 from public.minds_push_subscriptions) then raise exception 'TEST cross-user subscription read';end if;
 if exists(select 1 from public.minds_delivery_intents) then raise exception 'TEST cross-user delivery read';end if;
 if exists(select 1 from public.minds_delivery_attempts) then raise exception 'TEST cross-user attempt read';end if;
end $$;
reset role;

set local role service_role;
do $$
declare i public.minds_delivery_intents;s uuid;x jsonb;
begin
 select * into i from public.minds_claim_delivery_intents(1)
 where user_id='f1000000-0000-4000-8000-000000000071'
 limit 1;
 if i.id is null or i.status<>'processing' or i.lease_token is null then raise exception 'TEST delivery claim/lease';end if;

 select id into s from public.minds_push_subscriptions
 where user_id=i.user_id and active limit 1;

 x:=public.minds_finish_delivery_intent(
   i.id,i.lease_token,
   jsonb_build_array(jsonb_build_object(
     'subscription_id',s,
     'status','accepted',
     'http_status',201,
     'endpoint_hash','test-hash'
   ))
 );
 if x->>'status'<>'sent' then raise exception 'TEST delivery receipt: %',x;end if;
 if (select count(*) from public.minds_delivery_attempts where intent_id=i.id)<>1 then raise exception 'TEST delivery attempt ledger';end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000071',true);
set local role authenticated;
do $$
declare x jsonb;
begin
 x:=public.minds_remove_push_subscription('https://push.example.invalid/subscription-a');
 if (x->>'deactivated')::integer<>1 then raise exception 'TEST subscription removal';end if;
 if exists(select 1 from public.minds_push_subscriptions where active) then raise exception 'TEST subscription remained active';end if;
end $$;
reset role;

select 'PASS: push registration, RLS, attention separation, idempotent enqueue, service lease, delivery receipt and removal' as result;
rollback;
