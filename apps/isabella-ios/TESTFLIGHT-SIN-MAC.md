# Window · Primera instalación mediante TestFlight (sin Mac)

**Estado 28/10/2026:** el propietario confirmó en capturas el alta de **Window** en App Store Connect, los tres App IDs, el App Group, la Team API Key con rol App Manager y el entorno GitHub `apple-testflight` con las dos variables y tres secretos. El `preflight` de `main` finalizó **Success**. **Aún no se ha realizado una compilación firmada, una subida a TestFlight ni una aceptación en iPhone**. La asociación final del Widget con el App Group debe confirmarse mediante firma o revisando Apple Developer. El icono de Window es provisional y se prepara desde el icono existente de la PWA.

## A. Prueba de compilación (superada el 28/10/2026)

En [GitHub Actions del repositorio](https://github.com/gari01234/minds/actions/workflows/ios-testflight.yml) abrir «Isabella iPhone — TestFlight (manual)» > «Run workflow». Elegir `main` y modo **`preflight`**. El runner macOS 26 verifica Xcode 26+, genera el proyecto XcodeGen y compila para simulador los tres targets: `MINDS`, `MINDSShare`, `MINDSWidget`. Este modo no accede a Apple, no tiene secretos y **no sube nada**. La aceptación del simulador no equivale a firma de distribución ni prueba física.

Desde el 28/04/2026 Apple exige Xcode 26 o superior con el SDK correspondiente para subir apps de iOS. El pipeline anterior no lo garantizaba. Ahora usa `macos-26` y un control explícito. Referencia: https://developer.apple.com/news/upcoming-requirements/

## B. Cinco preparaciones que requieren tu cuenta Apple

Estos pasos pueden hacerse en Safari solicitando «Sitio web de escritorio». **No nos envíes capturas que incluyan claves, códigos, certificados, contraseñas o tokens**.

**1 · Team ID.** En https://developer.apple.com/account, abre Membership details e identifica el **Team ID de diez caracteres** de tu equipo individual. Coincide con la cuenta que tiene el rol Account Holder. No confundir con el nombre de equipo ni el Apple Account.

**2 · Identificadores y App Group.** En https://developer.apple.com/account/resources/identifiers/list registra tres App IDs explícitos para la misma familia:
- Principal: `<tu.bundle.id>` (ejemplo de formato `com.ejemplo.minds`, no un identificador decidido ni registrado por nosotros).
- Share Extension: `<tu.bundle.id>.share`.
- Widget Extension: `<tu.bundle.id>.widget`.

No reutilizar `local.minds.isabella`, reservado al desarrollo. Crear además un App Group `group.<tu.bundle.id>`, habilitar la capacidad «App Groups» y asociarlo **a los tres App IDs**. Revisar este identificador antes de registrarlo; debe permanecer estable en actualizaciones. Los permisos de grupo y aprovisionamiento reales se comprueban al archivar, no los inferimos de XcodeGen. Documentación: https://developer.apple.com/help/account/identifiers/register-an-app-id y https://developer.apple.com/help/account/identifiers/register-an-app-group.

**3 · Ficha privada de app.** **Completado:** Apple aceptó la ficha iOS de **Window** con Bundle ID `com.gari01234.minds`. Crear esta ficha **no publica** la app en App Store. La primera prueba será por **Internal Testing**. Las extensiones no necesitan fichas independientes en App Store Connect.

**4 · App Store Connect API.** **Completado en la cuenta del propietario:** acceso aprobado y Team API Key «Window TestFlight GitHub» con rol App Manager. Referencia para verificar o renovar: abre https://appstoreconnect.apple.com/access/integrations/api y, si lo solicita, **Request Access**. Apple revisa este acceso caso por caso; membresía activa no significa que la API esté activada. Cuando esté habilitado, genera una **Team API Key** de alcance suficientemente limitado para aprovisionamiento y subida (normalmente «Admin» o permiso apropiado; comprobar las operaciones permitidas por Apple), no una «Individual API Key». Guarda una única vez el `AuthKey_<KEY_ID>.p8`, el **Key ID** de diez caracteres y el **Issuer ID** UUID. Nunca pegar `.p8` en ChatGPT, Issues ni el repositorio.

**5 · GitHub Environment.** **Completado según capturas:** entorno `apple-testflight` restringido a `main`, dos variables y tres secretos. Para revisar: en https://github.com/gari01234/minds/settings/environments crea o abre `apple-testflight`. Configura *environment variables*:
- `ISABELLA_APPLE_TEAM_ID` = Team ID del paso 1.
- `ISABELLA_IOS_BUNDLE_ID` = Bundle ID principal exacto del paso 2.

Configura *environment secrets*:
- `ISABELLA_ASC_ISSUER_ID` = Issuer ID.
- `ISABELLA_ASC_KEY_ID` = Key ID.
- `ISABELLA_ASC_API_KEY_P8` = contenido completo de la clave privada `.p8` (incluyendo BEGIN/END).

Nunca uses un secreto de repositorio público para estos valores; se referencian solo en el job `distribute` ligado al entorno `apple-testflight`. Si GitHub permite revisores/branch restrictions de Environment, restringir a `main`. **No realizar `upload` antes de verificar que todos los pasos anteriores estén completos.**

## C. Primer TestFlight real

En el mismo workflow manual de GitHub elige `main` y modo **`upload`**. El preflight de simulador debe pasar primero; luego se accede al entorno `apple-testflight`, se validan los formatos de la configuración, se genera temporalmente la clave del runner y se solicita a Apple aprovisionamiento automático. Si los perfiles y certificados de App Group están disponibles, Xcode crea el archivo firmado con aplicación + las dos extensiones, y `xcodebuild -exportArchive` con `method=app-store-connect` y `destination=upload` envía el build.

El workflow no publica en App Store. Antes de XcodeGen, prepara un icono provisional AppIcon de 1024 px, sin alfa, a partir del icono de la PWA, y usa «Window» como nombre visible en iPhone. Abre https://appstoreconnect.apple.com/apps > MINDS > TestFlight para ver el resultado del procesamiento de Apple. Si aparece el build, crea un grupo **Internal Testing** y añade tu usuario App Store Connect; instala [TestFlight](https://apps.apple.com/app/testflight/id899247664) en iPhone y acepta la invitación. No asumir éxito porque el job de GitHub muestre upload completado; **Apple debe procesarlo**.

Los primeros intentos podrían revelar errores de firma, permisos API, bundle IDs, perfiles de grupo, iconos/metadatos, versión Xcode o compatibilidad de extensiones. En esos casos revisar logs con cuidado, nunca copiar claves o tokens. Dejar los recibos y el estado de Apple como verdad.

## D. Criterios de aceptación del primer iPhone

La app actual integra una superficie nativa (Continuidad, Chat, Agenda), Share Extension/WidgetKit y un puente WKWebView a la **PWA completa**. Su intención es no perder nada de lo ya construido. Aun así, un wrapper WebKit **no prueba paridad**: comprobar acceso a Isabella real, planificación, Work/archivos, Threads, Lecturas/Sofía, memoria/recibos, notificaciones, teclado, navegación, descargas y el logout conjunto. La sesión web es independiente de la nativa; iniciar sesión en ambas con la **misma cuenta MINDS**. La captura de Share Extension queda local hasta que se complete #221; no se debe prometer que ya alimenta conocimiento en Supabase. APNs y funciones Watch siguen siendo trabajos posteriores.

El primer objetivo es tener un binario auténtico en el iPhone y abrir una matriz de pruebas; **no declarar producto terminado** tras el primer upload. No crear una segunda Isabella, no cambiar Source-First, permisos, datos de producción ni el alcance de Build 101.
