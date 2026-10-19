import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('apps/isabella/app.js');
test('Push renewal creates a fresh subscription only after a user click',()=>{
  const start=app.indexOf('async function renewPushNotifications(){');
  const end=app.indexOf('async function disablePushNotifications(){',start);
  assert.ok(start>=0&&end>start);
  const renewal=app.slice(start,end);
  assert.match(renewal,/minds_remove_push_subscription/);
  assert.match(renewal,/await previous\.unsubscribe\(\)/);
  assert.match(renewal,/return enablePushNotifications\(\)/);
  assert.ok(renewal.indexOf('minds_remove_push_subscription')<renewal.indexOf('previous.unsubscribe()'));
  assert.ok(renewal.indexOf('previous.unsubscribe()')<renewal.indexOf('enablePushNotifications()'));
  assert.ok(app.includes('renewButton.onclick=async()=>'));
  assert.ok(app.includes('try{await renewPushNotifications();await pushNotificationsPanel()}'));
});
test('diagnostics distinguish server push acceptance from visible iOS delivery',()=>{
  assert.ok(app.includes('Enviar aviso de prueba'));
  assert.ok(app.includes('esta aceptación no garantiza su visualización'));
  assert.ok(app.includes('para comprobar si iOS muestra realmente la notificación'));
  assert.ok(app.includes('env.ios&&!env.standalone'));
  assert.ok(app.includes('Notification.requestPermission()'));
  assert.ok(read('apps/isabella/sw.js').includes("isabella-shell-v151"));
  assert.ok(read('apps/isabella/index.html').includes("app.js?v=122"));
});
