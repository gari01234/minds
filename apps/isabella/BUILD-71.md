# Build 71 — Native Presence & Delivery Layer v0.1

Fecha: 2 de octubre de 2026. Base comprobada antes de editar: `a1c4118dfb2dfb0183e2bae0285af2daeaa69143` (Build 70, workflow #302 correcto). Esta build no convierte Isabella en una app nativa: la primera superficie de presencia usa la PWA instalada y Web Push.

## Contrato

Attention Economy conserva toda la autoridad cognitiva sobre si una señal merece `interrupt`, `briefing`, `ambient` o `silent`. Delivery Layer no recalcula importancia, no cambia quiet hours, no aumenta el presupuesto de interrupciones y no convierte señales de briefing/Feed en push.

La secuencia queda separada así:

`Attention Economy → Delivery Intent → Web Push Transport → dispositivo → Delivery Attempt/Receipt`.

Un evento solo entra en delivery cuando ya existe como `minds_attention_events` con `route=interrupt` y `status=delivered`. El mensaje de chat continúa siendo el registro principal de la interrupción; Web Push añade presencia fuera de la web.

## Presencia en el dispositivo

`Más → Avisos de Isabella` muestra un estado humano por dispositivo. El permiso del sistema se solicita únicamente después de la acción explícita `Permitir avisos en este dispositivo`. En iPhone/iPad, la interfaz exige la web app instalada en pantalla de inicio antes de solicitar el permiso.

El cliente obtiene solo la clave VAPID pública desde `isabella-push`, crea o reutiliza su `PushSubscription` y la registra mediante una RPC autenticada. La clave VAPID privada nunca se entrega al navegador.

El Service Worker recibe `push`, muestra inmediatamente una notificación visible y conserva el deep link de origen. Al tocarla, limpia el badge cuando la plataforma lo permite, enfoca una ventana de Isabella existente o abre la PWA en la URL asociada.

## Persistencia y entrega durable

| Objeto | Responsabilidad |
|---|---|
| `minds_push_subscriptions` | Suscripciones Web Push por usuario y dispositivo |
| `minds_delivery_intents` | Intención durable de transporte derivada de una interrupción ya decidida |
| `minds_delivery_attempts` | Ledger de intentos aceptados, expirados/gone o fallidos |
| `minds_enqueue_push_from_attention` | Trigger que proyecta únicamente `interrupt + delivered` hacia delivery |
| `minds_claim_delivery_intents` | Claim con `FOR UPDATE SKIP LOCKED` y lease de tres minutos |
| `minds_finish_delivery_intent` | Receipt, retry/backoff, stale endpoint cleanup y cierre idempotente |
| `isabella-delivery-runner` | Transporte server-side Web Push; no decide atención |
| `isabella-push` | Endpoint autenticado que entrega la VAPID pública |

Los intents caducados se marcan `skipped`. Los endpoints que el servicio push devuelve como 404/410 quedan inactivos. Una entrega se considera `sent` cuando al menos un servicio push aceptó el mensaje; eso no afirma que Gari lo leyó. El ledger conserva exactamente qué se conoce y no transforma aceptación del servicio en apertura humana.

## Transporte

El runtime usa `@mmmike/web-push@1.3.0` fijado a versión exacta. Las claves VAPID se generan una sola vez y se conservan en `isabella_runtime_secrets`, siguiendo el patrón de secretos runtime ya usado por Missions/Heartbeat. El runner se autentica con `delivery_runner` y se programa cada minuto.

La copia push empieza a aplicar la dirección Human Surface sin convertir Build 71 en Build 72. Por ejemplo, un `mission_waiting_for_user` se expresa como “Necesito que decidas algo para poder seguir…”, mientras el estado técnico sigue disponible debajo.

## Seguridad y autoridad

Las tablas nuevas tienen RLS y lectura propia. `authenticated` no dispone de INSERT/UPDATE/DELETE directo. Registrar o retirar una suscripción requiere identidad autenticada. Claim, finish y almacenamiento VAPID quedan reservados a `service_role`. Delivery no dispone de ninguna RPC capaz de modificar la ruta de Attention Economy.

No se añade una acción autónoma nueva, no se amplía Contextual Autonomy y no se concede ningún permiso personal.

## Verificación de repositorio

La implementación está en PR #1, rama `build-71-native-presence`. El primer run de `Verify MINDS` detectó una aserción situada en la capa incorrecta; la prueba se corrigió para comprobar el tag de deduplicación donde realmente se produce, en el delivery runner, sin modificar el comportamiento. El gate se endureció además con `deno check` para las dos Edge Functions nuevas. Ese typecheck detectó dos incompatibilidades reales antes del despliegue —una propiedad no admitida por el contrato de Web Push y una inferencia demasiado laxa del par VAPID— y ambas se corrigieron sin debilitar comportamiento ni pruebas. El run final verificado, #7 (`37009073674`), terminó en `success`: **159 tests Node, 159 pass, 0 fail**, `node scripts/build.mjs` correcto y `deno check` correcto para `isabella-push` e `isabella-delivery-runner`.

Se añadió además `supabase/tests/native_presence.sql`, transaccional y con rollback, para comprobar registro/retirada, RLS, separación de Attention, enqueue idempotente, claim/lease y receipt. Esa suite todavía no se ha ejecutado contra el Supabase real de MINDS desde este chat.

## Estado de despliegue

El conector Supabase disponible durante esta build no expone el proyecto MINDS `lodexwyyynlarkqgkyhy`; solo expone otros proyectos. Por seguridad no se ha aplicado la migración ni desplegado `isabella-push`/`isabella-delivery-runner` en un proyecto distinto.

Por la misma razón, **PR #1 permanece draft y `main` sigue en Build 70**. Esto evita publicar una interfaz Build 71 que dependa de backend todavía no desplegado. El cierre de Build 71 requiere conectar el Supabase exacto, ejecutar primero las suites SQL con rollback, aplicar la migración, desplegar las dos funciones, verificar cron/versiones, fusionar PR #1 y comprobar el workflow oficial de Pages.

No declarar Build 71 publicada hasta completar esos pasos.
