import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared/supabase-client.js', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../apps/isabella/sync.js', import.meta.url), 'utf8');

function load({bridge}) {
  const calls = [], created = [], storage = new Map([['sb-lodexwyyynlarkqgkyhy-auth-token', '{"refresh_token":"old"}']]);
  const window = {
    supabase: {createClient: (url, key, options) => {
      const client = {options, auth: new Proxy({}, {get() { throw new Error('auth disabled'); }})};
      created.push(client);
      return client;
    }},
    webkit: bridge ? {messageHandlers: {windowNative: {postMessage: async body => {
      calls.push(body.type);
      if (body.type === 'session.get') return {v: 1, ok: true, session: {
        access_token: 'access-1', expires_at: Math.floor(Date.now() / 1000) + 3600, user: {id: 'u-1', email: 'g@example.com'}}};
      return {v: 1, ok: true};
    }}}} : undefined
  };
  const context = {window, console, URL, Date, Math, Promise, Set, Object, String,
    localStorage: {removeItem: k => storage.delete(k)}};
  vm.runInNewContext(source, context);
  return {window, calls, created, storage};
}

test('inside the Window app the page borrows the session from the app and never owns one', async () => {
  const {window, calls, created, storage} = load({bridge: true});
  const sb = window.MINDS_SUPABASE;
  assert.equal(created.length, 1);
  assert.equal(typeof created[0].options.accessToken, 'function');
  assert.equal(created[0].options.auth, undefined, 'no persisted or auto-refreshed web session');
  assert.equal(storage.size, 0, 'a stale web session is removed');
  const {data: {session}} = await sb.auth.getSession();
  assert.equal(session.access_token, 'access-1');
  assert.equal(session.user.id, 'u-1');
  assert.equal(session.refresh_token, undefined, 'the refresh token never reaches the page');
  assert.equal(await created[0].options.accessToken(), 'access-1');
  await sb.auth.getUser();
  assert.deepEqual(calls, ['session.get'], 'the access token is cached until shortly before it expires');
  const seen = [];
  sb.auth.onAuthStateChange((event, s) => seen.push([event, s?.user?.id]));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(JSON.stringify(seen), JSON.stringify([['INITIAL_SESSION', 'u-1']]));
  const otp = await sb.auth.signInWithOtp({email: 'x@example.com'});
  assert.ok(otp.error, 'web sign-in is not used inside the app');
  await sb.auth.signOut();
  assert.deepEqual(calls.slice(1), ['session.signIn', 'session.signOut']);
  assert.equal(window.WINDOW_NATIVE.available, true);
  assert.equal(window.WINDOW_NATIVE.version, 1);
});

test('in Safari, the PWA and on the desktop nothing changes', () => {
  const {window, created, storage} = load({bridge: false});
  assert.equal(created[0].options.auth.persistSession, true);
  assert.equal(created[0].options.auth.autoRefreshToken, true);
  assert.equal(created[0].options.accessToken, undefined);
  assert.equal(window.WINDOW_NATIVE, undefined);
  assert.equal(storage.size, 1);
});

test('the web sign-in hands over to the app when the bridge exists', () => {
  assert.match(sync, /if\(window\.WINDOW_NATIVE\?\.available\)\{void window\.WINDOW_NATIVE\.call\('session\.signIn'\);return\}/);
  assert.doesNotMatch(sync, /WindowApp\\\//, 'no user-agent sniffing: app mode is the bridge');
});
