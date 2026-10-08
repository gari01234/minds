import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

test('Build 71 keeps attention policy separate from device delivery',()=>{
  const migration=read('supabase/migrations/20261002125419_native_presence_delivery_v01.sql');
  assert.ok(migration.includes('create table if not exists public.minds_delivery_intents'));
  assert.ok(migration.includes('create trigger minds_attention_enqueue_push'));
  assert.ok(migration.includes("new.route='interrupt' and new.status='delivered'"));
  assert.ok(!migration.includes('create or replace function public.minds_route_attention'));
  assert.ok(!migration.includes('update public.minds_attention_events set route='));
});

test('Build 71 stores push subscriptions behind authenticated RPC and RLS',()=>{
  const migration=read('supabase/migrations/20261002125419_native_presence_delivery_v01.sql');
  assert.ok(migration.includes('alter table public.minds_push_subscriptions enable row level security'));
  assert.ok(migration.includes('minds_register_push_subscription'));
  assert.ok(migration.includes('minds_remove_push_subscription'));
  assert.ok(migration.includes('using ((select auth.uid())=user_id)'));
  assert.ok(migration.includes('revoke insert,update,delete on public.minds_push_subscriptions from authenticated,anon'));
});

test('Build 71 durable delivery has leases retries receipts and stale endpoint cleanup',()=>{
  const migration=read('supabase/migrations/20261002125419_native_presence_delivery_v01.sql');
  assert.ok(migration.includes('create table if not exists public.minds_delivery_attempts'));
  assert.ok(migration.includes('for update skip locked'));
  assert.ok(migration.includes("status='processing'"));
  assert.ok(migration.includes("status='retry'"));
  assert.ok(migration.includes("set active=false"));
  assert.ok(migration.includes("last_error='expired'"));
  assert.ok(migration.includes("'minds-delivery-runner'"));
});

test('Build 71 web push runner uses pinned edge-native VAPID transport',()=>{
  const runner=read('supabase/functions/isabella-delivery-runner/index.ts');
  const shared=read('supabase/functions/_shared/webpush.ts');
  assert.ok(runner.includes('npm:@mmmike/web-push@1.3.0/send'));
  assert.ok(shared.includes('npm:@mmmike/web-push@1.3.0/vapid'));
  assert.ok(runner.includes('minds_claim_delivery_intents'));
  assert.ok(runner.includes('minds_finish_delivery_intent'));
  assert.ok(runner.includes('status===404||status===410'));
  assert.ok(shared.includes('humanPushBody'));
});

test('Build 71 never exposes the private VAPID key to the authenticated client',()=>{
  const push=read('supabase/functions/isabella-push/index.ts');
  assert.ok(push.includes('auth.getUser()'));
  assert.ok(push.includes('public_key:keys.publicKey'));
  assert.ok(!push.includes('private_key:'));
  assert.ok(!push.includes('privateKey:keys.privateKey'));
});

test('Build 71 requests device permission only from the explicit Isabella alerts action',()=>{
  const app=read('apps/isabella/app.js');
  const shell=read('apps/isabella/shell.js');
  assert.ok(shell.includes('data-action="push">Avisos de Isabella'));
  assert.ok(app.includes("if(a==='push')void pushNotificationsPanel()"));
  assert.ok(app.includes('Notification.requestPermission()'));
  assert.ok(app.includes("minds_register_push_subscription"));
  assert.ok(app.includes("minds_remove_push_subscription"));
  assert.ok(app.includes("Añadir a pantalla de inicio"));
  assert.equal((app.match(/Notification\.requestPermission\(\)/g)||[]).length,1);
});

test('Build 71 service worker shows visible pushes and opens their Isabella deep link',()=>{
  const sw=read('apps/isabella/sw.js');
  assert.ok(sw.includes("self.addEventListener('push'"));
  assert.ok(sw.includes('self.registration.showNotification'));
  assert.ok(sw.includes("self.addEventListener('notificationclick'"));
  assert.ok(sw.includes('self.clients.openWindow(target)'));
  assert.ok(sw.includes('tag: payload.tag ? String(payload.tag) : undefined'));
  const runner=read('supabase/functions/isabella-delivery-runner/index.ts');
  assert.ok(runner.includes('tag:"attention-"+String(intent.attention_event_id)'));
});

test('Build 71 declares authenticated config and secret delivery runner functions',()=>{
  const config=read('supabase/config.toml');
  assert.ok(config.includes('[functions.isabella-push]'));
  assert.ok(config.includes('entrypoint = "./functions/isabella-push/index.ts"'));
  assert.ok(config.includes('[functions.isabella-delivery-runner]'));
  const deliveryBlock=config.slice(config.indexOf('[functions.isabella-delivery-runner]'));
  assert.ok(deliveryBlock.includes('verify_jwt = false'));
});

test('Build 71 native presence remains wired into the current PWA',()=>{
  const shell=read('apps/isabella/shell.js');
  const index=read('apps/isabella/index.html');
  const sw=read('apps/isabella/sw.js');
  assert.ok(shell.includes('Build 2026.10.08.86.5'));
  assert.ok(index.includes('shell.js?v=89'));
  assert.ok(index.includes('app.js?v=97'));
  assert.ok(sw.includes("const CACHE_NAME = 'isabella-shell-v107'"));
});
