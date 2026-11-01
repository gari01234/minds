# MINDS · Equivalencia funcional iOS v0.1
Fecha: 25 octubre 2026 · Decisión explícita del propietario · Relacionado: #212, #205, #214–#221.

## Decisión de producto — prevalece sobre simplificaciones anteriores
La app del iPhone debe ofrecer **todo lo que ya existe en la webapp MINDS**, además de las capacidades Apple. No se autoriza sustituir la PWA avanzada por un cliente reducido que pierda funciones, fuentes, sesiones, conocimiento o historia. Una superficie más nativa puede cambiar navegación y presentación, pero **no el alcance funcional ni la semántica canónica**.

**Equivalencia funcional ≠ reproducción de pantallas.** La igualdad esperada es de funciones, datos, identidad, fuentes, propuestas, resultados, estados, historial y autorizaciones. SwiftUI puede ser una presentación distinta sin duplicar lógica. Mantener la PWA mientras la cobertura nativa se verifica.

## Arquitectura fija
- Único backend: Supabase `lodexwyyynlarkqgkyhy`; un solo MINDS Control Plane, `native_minds`, memoria, políticas de autoridad, Knowledge Coverage, Attention Economy y Artifact Intake. No crear otra Isabella.
- El iPhone puede contener vistas nativas, Share Extension, notificaciones APNs, widgets y (solo si hay reloj compatible) watchOS.
- **Fase puente:** pestaña «MINDS» que integra mediante WKWebView la aplicación existente publicada en `https://gari01234.github.io/minds/isabella/`. Theory/Lecturas conserva su ruta `/minds/theory/`. Esta integración evita ocultar funciones PWA aún no reconstruidas.
- **Desde build 9 (noviembre 2026):** Window abre solo la aplicación web a pantalla completa, sin barra de pestañas nativa ni barra «MINDS completo» y con un único inicio de sesión (el de la web, por código de correo). Continuidad, Chat y Agenda nativos siguen en el proyecto pero no se muestran hasta que igualen a la web.
- El inicio de sesión del navegador embebido **es independiente** del OTP/Keychain nativo. Se debe entrar con la misma cuenta; no se inyecta el JWT o refresh token de Keychain en JavaScript, ni se presupone SSO. Logout nativo debe limpiar también cookies y caché WebKit.
- El portal permite navegación principal solo por HTTPS en `gari01234.github.io/minds/`; abre enlaces externos fuera del navegador embebido. No introduce puentes JS de escritura ni privilegios locales.

## Inventario de paridad — no cerrar sin prueba real
| Área ya existente en PWA | Camino inmediato iOS | Paridad nativa / aceptación pendiente |
| --- | --- | --- |
| Isabella Chat, historia, búsqueda, herramientas, propuestas, decisiones y recibos | MINDS completo WebKit; Chat nativo parcial separado | Múltiples propuestas, archivos, turnos complejos, recuperación y enlaces exactos |
| Situación, Feed, Ideas y avisos contextuales | MINDS completo WebKit | Proyección nativa y atención en dispositivo, sin segunda policy |
| Tiempo: agenda día/semana/mes, recurrencias, sesiones y planificación | MINDS completo WebKit; Agenda SwiftUI parcial | Gestos, equipo, planner, timezone, recurrencias, aprobaciones, sync |
| Work: Desktop, Planner, Conocimiento, Threads, proyectos, personas, documentos | MINDS completo WebKit | Fuentes, uploads/downloads, edición, localizadores y versionado en iPhone |
| Lecturas/Sofía: corpus, anotaciones, memoria de lectura, exégesis | MINDS completo WebKit (ruta Theory) | Navegación táctil, anotaciones, historial, scopes y recuperación real |
| Thoughts y otras superficies históricas | MINDS completo WebKit | Verificar WebGL, iframe sandbox, rendimiento y tiempo de la obra |
| Skills, Missions, Commitments, Persistent Work, entregables y artefactos | MINDS completo WebKit cuando la PWA expone la función | Reanudación, entrega, edición/descarga de archivos y receipts |
| Captura Share Extension (A) | Adquisición offline en App Group ya fusionada | **No hay todavía admisión canónica**: #221; upload, receipt, destino, revisión |
| Push nativo (C) | PWA Web Push existente | APNs #215/#219, opt-in, deduplicación con PWA, delivery receipts |
| WidgetKit (E) | Conteos privados con TTL y App Group | Firma, TestFlight, logout, privacidad, deep links por ID, pantallas bloqueadas |
| Apple Watch (G) | No incorporado | #220 solo tras confirmar dispositivo real, firma y aceptación |
| Siri / Atajos | Consultas básicas read-only nativas existentes | Confirmar permisos y comportamiento físico; sin acciones nuevas implícitas |

## Conclusión probatoria
**La presencia de una pestaña WKWebView no equivale a una aceptación de paridad.** Primero verificar en iPhone firmado con la cuenta real: inicio de sesión web y nativo coherentes; recuperar Chats, Work y Lecturas; creación/revisión/recibos; subida y **descarga** de documentos; archivo y voz; regreso tras cierre/suspensión; enlaces externos; navegación interna; logout; y aislamiento de cuentas. WebKit puede comportarse distinto de Safari/PWA: registrar fallos antes de declarar equivalencia.

La app nativa no se considera terminada porque compile en simulador o porque todas las rutas existan. Cerrar una fila solo con aceptación empírica y recibos. Priorizar después conversiones SwiftUI donde la experiencia mejore claramente, **sin retirar el puente web hasta demostrar cobertura total**.

## Secuencia
1. Integrar el puente de equivalencia sin reescribir modelos ni producción; CI de iOS y Verify MINDS.
2. Firmar y distribuir por TestFlight cuando Apple Developer/IDs/App Group estén activos; comprobar PWA embebida en dispositivo y documentar limitaciones.
3. Completar captura canónica #221 con Source-First, integridad del original y aprobación de destino.
4. Incorporar APNs vía Attention Economy, y widgets/deep links bajo exact decision binding; Watch solo con dispositivo.
5. Implementar nativamente las áreas por valor de uso, con matriz comparativa PWA↔iOS y E2E por área. Build 101 (Daily & Weekly Workload Intelligence) es un frente separado; #113, #138 y #204 no se cierran por esta implementación.

## Condiciones invariantes
Capabilities no crean autoridad; una notificación o tap no equivale a aprobación; la falta de respuesta no equivale a no ocurrencia. Fuentes originales/versiones antes de Claims; extracciones propuestas antes de conocimiento aceptado. `isabella-uploads` y `minds-work` no deben confundirse con `minds_artifact_intake`. No duplicar Tasks, Watch, Expectations, permisos, conversación ni lógica de negocio. Ningún token de servidor o JWT en App Group/Widget.
