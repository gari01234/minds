# Isabella iOS vNext · Continuity Surface / auditoría 25-10-2026

## Diagnóstico verificado y decisión

Main inicial e86e8a8a68772cbae84ab71586841744398e5720. El prototipo SwiftUI se introdujo el 26-09; se registraron 278 commits posteriores en minds hasta este corte. Builds 95–99C reformaron planificación personal y Work (task/session/team/allocations), Builds 100A–100A.5 reformaron recibos, restauración y telemetría. Un TabView iOS con Feed, Ideas y Lecturas placeholder no representa la aplicación que se usa actualmente. Los PR #206–#211 han mejorado conectividad y compilación, no equivalencia E2E.

La reconstrucción se realiza **en el mismo target iOS**, conservando el auth/Keychain, Supabase public key, revisión de tareas y la vía de firma sin Mac. No se crea otro servidor, otra Isabella ni otra app con estado propio. La nueva superficie sustituye tabs ficticias por **Continuidad · Chat · Agenda**. Feed/Lecturas/Ideas persisten en MINDS y podrán reaparecer mediante vistas nativas reales, no placeholders. No se elimina ninguna tabla ni fuente existente.

## Fuente de verdad / invariante

El teléfono es una superficie contextual, no el cerebro. La entidad canónica, su estado, su historial y su autoría viven en Supabase. La UI obtiene proyecciones owner-scoped con ID original y estado literal. No convertir `delivered` en `seen`, `paused` en `needs_user` ni `pending` en `confirmed`. Un recibo escrito en texto del modelo no equivale a un recibo persistido. Ante error de consulta, informar error; no representar vacío como certeza.

Primera consulta vNext: decisiones `minds_shadow_decisions.status=pending`; `minds_attention_events.status=delivered AND requires_user=true AND consumed_at IS NULL`; Misiones `minds_mission_runs.status IN (paused,waiting,in_progress)`; `minds_commitments.status=active`. Todo lectura con JWT/RLS. Las prioridades son **tipos de estado explícitos**, no un score sintético. No mezclar alertas de baja relevancia con decisiones del usuario.

## Capacidades seleccionadas — compromisos de producto

**A · Captura Universal**: Share Extension para texto, URL, fotos y documentos, con App Group una vez habilitada Apple Team. Conserva originales y provenance (origen, UID, hash, MIME, tamaño, fecha, enlace de objeto); inbox pendiente sin interpretación forzada. El Artifact Intake existente se creó para artefactos *producidos* por ejecuciones, no como API de admisión de archivos externos. Reutilizar storage owner-scoped y mecanismo de ingest sin reetiquetar una captura como claim/tesis; pedir destino o revisión. No exponer secretos en la extensión. El pipeline ha de tolerar cancelación, offline y duplicados mediante idempotencia.

**C · Notificaciones APNs**: añadir APNs como otro transport de `minds_delivery_intents` gobernado por `minds_attention_events`, sin sustituir Web Push/VAPID ya probado físicamente en la PWA. Token APNs por instalación/app, credencial Apple solo servidor, registro owner-scoped y revocación en logout, caducidad, retries y receipts de transporte separados del consumo. No aprobar mutaciones directamente con contenido de push; enlazar por IDs canónicos a revisión autenticada.

**E · Widgets/Lock Screen**: WidgetKit/App Intents; snapshot mínimo de continuidad, redacción de título/detalle sensible mientras el dispositivo esté bloqueado, App Group para datos no secretos con versión y expiración. No meter JWT en App Group ni prometer refresco en tiempo real. Acceso al objeto original al pulsar, semántica de continuidad consistente con app principal.

**G · Apple Watch**: app watchOS con vistazo al siguiente elemento de continuidad, captura breve y navegación/revisión en iPhone. WatchConnectivity cuando haya reloj compatible y confirmación física; no asumir que el usuario posee uno. No mantener una segunda sesión agentic, no autorizar mutaciones unilateralmente desde el reloj.

**Idea central — Interfaz de continuidad**: al leer, compartir, atender una reunión, tomar una decisión o recibir un trabajo terminado, Isabella transporta el contexto original y el estado correcto entre superficies. La presencia debe reducir interrupciones y explicar qué ha cambiado y cuándo es necesaria la intervención, no maximizar interacción.

## Seguridad auditada y gates

RLS owner-scoped en relaciones relevantes de Supabase. Advisors de 25/10 notificaron siete funciones SECURITY DEFINER ejecutables por anon y otras para authenticated; son advertencias para revisar alcance, no prueba de un exploit. No abrir nuevas escrituras nativas hasta verificar funciones, permisos y receipts. Los buckets ya existentes son privados: `isabella-uploads` 12 MiB, `minds-work` 100 MiB y `minds-artifact-intake` 20 MiB. No utilizar intake de outputs como caja de captura.

La Apple Developer membership está **Enrollment Pending** en la última evidencia, aunque el pago anual está confirmado; no se presume capacidad de firma hasta activar team y hacer TestFlight real. Build 101 original (Daily & Weekly Workload Intelligence) permanece independiente; #113, #138 y #204 siguen con criterios abiertos.

La aceptación exige CI y compilación de simulador, revisión de contratos reales, prueba física con sesión owner, accesibilidad, deep links, seguridad al bloquear el iPhone y evidencia de datos/recibos antes de declarar cualquier integración completa. Los recursos de GitHub y el pipeline Supabase activos no se modifican en esta fase.
