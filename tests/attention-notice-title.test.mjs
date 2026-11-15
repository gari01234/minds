// Un aviso lleva su título (15.11.2026).
//
// El heartbeat arma cada aviso con dos campos: title («Próximo: …») y body («Empieza a las
// 14:00.»). minds_publish_attention escribía en la conversación solo el body, así que en el chat
// quedaba la hora sin decir qué empieza. En Window se notaba menos que en Office porque la tarjeta
// del Feed sí muestra los dos campos.
//
// La prueba de comportamiento vive en Office, contra el esquema real migrado
// (tests/sql/office-attention-notice-title-acceptance.sql): allí se comprueba que título y texto
// van juntos, que un título ya contenido en el texto no se duplica, que falta uno y queda el otro,
// y que el enrutado y el estado de entrega no cambian. Aquí se fija que la expresión de Window es
// la misma, carácter por carácter, y que nadie vuelve a dejar el body solo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  new URL('../supabase/migrations/20261115130000_attention_notice_keeps_its_title.sql',import.meta.url),'utf8');

// Idéntica a la de Office. Si una de las dos cambia, esta comparación es lo que lo delata.
const CONTENT_EXPRESSION=`      case
        when coalesce(btrim(v_event.title),'')='' then v_event.body
        when coalesce(btrim(v_event.body),'')='' then v_event.title
        when position(btrim(v_event.title) in v_event.body)>0 then v_event.body
        else btrim(v_event.title)||' · '||v_event.body
      end,`;

test('el mensaje insertado lleva título y texto', () => {
  assert.ok(migration.includes(CONTENT_EXPRESSION),
    'la expresión del content no coincide con la de Office');
});

test('ya no queda ningún insert que escriba solo el body', () => {
  assert.ok(!migration.includes("'assistant',v_event.body,"),
    'vuelve a haber un insert con v_event.body como content entero');
});

test('la tarjeta del Feed sigue recibiendo los dos campos por separado', () => {
  // El Feed nunca tuvo el problema; el cambio no debe tocarlo.
  assert.match(migration,/'feed','isabella',v_event\.title,v_event\.body,/);
});

test('solo cambia el content: enrutado, entrega y retorno quedan igual', () => {
  assert.match(migration,/on conflict\(user_id,conversation_id,client_key\) do update set content=excluded\.content/);
  assert.match(migration,/set status='delivered',message_id=v_mid,delivered_at=now\(\),updated_at=now\(\)/);
  assert.match(migration,/return jsonb_build_object\('status',v_status,'id',v_event\.id,'route',v_route,'message_id',v_mid,'reason_code',v_event\.reason_code\);/);
  // La función sigue siendo la misma y conserva sus permisos.
  assert.match(migration,/create or replace function public\.minds_publish_attention\(p_user uuid,p_candidate jsonb\)/);
  assert.match(migration,/grant execute on function public\.minds_publish_attention\(uuid,jsonb\) to service_role;/);
  assert.match(migration,/revoke all on function public\.minds_publish_attention\(uuid,jsonb\) from public,anon,authenticated;/);
});
