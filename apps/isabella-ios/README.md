# Window para iPhone — MINDS completo + Apple

**Estado actualizado: 28 de octubre de 2026.** Cliente privado para un propietario. La app iOS debe conservar **toda la funcionalidad de la webapp de MINDS** y añadir integración Apple; no es un producto reducido ni un segundo agente. Decisión y aceptación: [IOS-FUNCTIONAL-PARITY-v0.1](../../docs/IOS-FUNCTIONAL-PARITY-v0.1.md).

## Lo implementado actualmente (código en main/PR, no aceptación física)
- **La app es dueña de la sesión (desde noviembre 2026):** se entra una vez en una pantalla nativa (código por correo); la sesión vive en el Llavero bajo la App Group y la comparten la Share Extension, el widget y los App Intents. La PWA se muestra a pantalla completa y recibe el access token por el puente tipado (`BRIDGE.md`); el refresh token nunca sale del Llavero. Las vistas nativas Continuidad/Chat/Agenda siguen en el código, ocultas.
- **Dos cuentas (desde el 07.11.2026):** como cambiar de usuario en GitHub.
  - **Persönlich** es Window; **Office** es TBA Office, con su propio proyecto de Supabase, su inicio con correo y contraseña, su sesión en el Llavero y su propio almacén web.
  - Se cambia desde el menú «•••» de la web o desde la pantalla de inicio de sesión. Ver `BRIDGE.md`.
  - El widget, la Share Extension y Siri siguen siendo solo de Persönlich.
- **Builds automáticos:** `ios-testflight-auto.yml` sube un build a TestFlight cuando cambia la app en `main` y cada dos meses (TestFlight caduca a los 90 días).
- **MINDS completo:** puente `WKWebView` hacia la PWA existente para navegar la superficie más avanzada (Chat, Work, Agenda/planificación, Lecturas, etc.) sin reescribir su lógica. Los enlaces principales permanecen en `/minds/`; enlaces externos abren Safari. El inicio de sesión web es **separado** del inicio de sesión nativo: usar la misma cuenta. No se inyecta el token Keychain en JavaScript. Logout nativo limpia también el estado web embebido.
- **Continuidad SwiftUI:** proyección owner-scoped de revisiones, Attention, Missions y Commitments, con estados/huecos honestos. No concede permisos ni ejecuta decisiones.
- **Isabella Chat nativo:** OTP, Keychain ThisDeviceOnly y llamadas autenticadas a `isabella-chat` con `surface=chat_browser`, `client_message_id` y contrato de recibos. Soporta un subconjunto limitado de aprobaciones; las demás requieren la interfaz web. No reintenta turnos o mutaciones con resultado ambiguo.
- **Agenda nativa:** eventos/tareas owner-scoped, recordatorios locales explícitos, Siri/Atajos básicos read-only. La planificación avanzada sigue accesible en MINDS web.
- **Share Extension + WidgetKit:** captura original offline en App Group, límite 12 MiB, y snapshot de conteos privados con TTL de cuatro horas. **Las capturas todavía no se admiten en Supabase** (#221). Widgets y extensiones precisan firma App Group y prueba física.

## Pendiente antes de declarar paridad
La pestaña WKWebView **no equivale a una aceptación de paridad**. Validar en un iPhone real mediante TestFlight: sesión web/nativa, conversaciones completas, Work/Threads, subida/descarga de documentos y artefactos, Lecturas/Sofía/annotaciones, gestos/teclado, navegación, notificaciones, suspensión/reanudación, cierre de sesión, scopes, VoiceOver y privacidad. La descarga de archivos y algunas APIs WebKit pueden comportarse distinto de Safari. Los contratos nativos/servidor de estas áreas no se replicarán silenciosamente.

Después: admisión Source-First de capturas (#221), APNs vía Attention Economy (#215/#219), Widgets con deep links exactos (#216) y Apple Watch (#220) **solo** si hay dispositivo real. No interpretar la compilación de simulador como aceptación. No cambiar Build 101 por este trabajo.

## Instalación y distribución
**Nombre visible de la app: Window**; Isabella conserva su identidad como asistente y MINDS como sistema. Para la primera distribución se genera automáticamente un icono **provisional** de 1024 px a partir del icono existente de la PWA, sin adoptar todavía una nueva identidad gráfica. Antes de ejecutar XcodeGen fuera de CI, ejecutar en macOS `bash Config/prepare-app-icon.sh`.

El repositorio incluye `project.yml` (XcodeGen, iOS 17+), `.github/workflows/ios-native.yml` y `.github/workflows/ios-testflight.yml`. Véase [TESTFLIGHT-SIN-MAC.md](TESTFLIGHT-SIN-MAC.md) para Team ID, tres Bundle IDs y App Group. La membresía Apple Developer está **activa**, confirmada por la cuenta Account Holder y vigencia hasta 26/10/2027. El aprovisionamiento, los identificadores, el App Group y la primera firma **no están verificados**. El workflow de TestFlight ofrece los modos manuales `preflight` (sin Apple) y `upload` (requiere secretos del entorno `apple-testflight` y la ficha creada en App Store Connect). No presuponer aceptación a partir de CI.

No guardar Team API private keys `.p8`, service_role, certificados, perfiles de firma ni JWT en el repositorio o chat. Supabase sigue siendo la autoridad: originales, tareas, proyectos, memoria, decisiones, ejecución y notificaciones conservan sus contratos existentes.

## Historia
El prototipo iOS del 26 de septiembre aportó OTP, chat y agenda; la reconstrucción de octubre sumó Continuidad (#213), Share Extension y WidgetKit (#218). La PWA sigue siendo funcionalmente más amplia: el puente MINDS completo evita pérdida de acceso **mientras** migramos área por área. La aceptación nativa sigue pendiente de dispositivo físico.
