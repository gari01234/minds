# Window · Primera instalación mediante TestFlight (sin Mac)

**Estado 29/10/2026:** el propietario confirmó en capturas el alta de **Window** en App Store Connect, los tres App IDs, el App Group, la Team API Key con rol App Manager y el entorno GitHub `apple-testflight` con las dos variables y tres secretos. El `preflight` de `main` finalizó **Success**. **TestFlight run #2 (40721375717) falló al archivar**: la firma automática de Release solicitó perfiles iOS App Development para los tres targets y el equipo no tiene dispositivos registrados. La subida quedó omitida. **Aún no hay distribución ni aceptación en iPhone confirmadas**. La asociación final del Widget con el App Group debe confirmarse mediante firma o revisando Apple Developer. El icono de Window es provisional y se prepara desde el icono existente de la PWA.

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

En el mismo workflow manual de GitHub elige `main` y modo **`upload`**, una sola vez después de que CI del ajuste pase. El preflight de simulador debe pasar primero; luego se accede al entorno `apple-testflight` y se valida la configuración existente. No repetir el alta de App IDs, ficha, API key ni secretos.

El archivo para dispositivo se prepara con `CODE_SIGN_IDENTITY=-`, `AD_HOC_CODE_SIGNING_ALLOWED=YES` y `CODE_SIGN_STYLE=Automatic`, sin credenciales ni peticiones de aprovisionamiento en el comando de archivo. Esta firma local conserva los entitlements de app, Share y Widget; **no es la distribución Ad Hoc de Apple, no permite instalar el archivo y no requiere UDID**. `Release` por sí solo no selecciona distribución: en el run #2 se pidió desarrollo antes de llegar a la exportación. Desactivar toda firma con `CODE_SIGNING_ALLOWED=NO` en este archivo arriesgaría perder entitlements; se conserva únicamente en simulador.

La CI macOS comprueba los build settings efectivos de los tres targets y ejecuta el mismo archivo para dispositivo sin secretos. Después verifica firmas locales, Bundle IDs, versiones, ambas extensiones y App Group firmado. No modifica la configuración de desarrollo de `project.yml`.

`xcodebuild -exportArchive` aplica `method=app-store-connect`, `destination=export` y firma automática con la API key existente: aquí Xcode solicita los perfiles de distribución y utiliza firma gestionada por Apple. Antes de subir, se inspecciona el IPA real: las tres firmas deben tener autoridad Apple Distribution, el mismo equipo, identificadores exactos y el grupo `group.com.gari01234.minds`; cada perfil debe ser vigente, App Store/TestFlight, sin dispositivos ni depuración. Este control incluye explícitamente el Widget. Solo entonces `altool` sube ese mismo IPA. Ni perfiles ni IPA ni claves se publican como artifacts.

La exportación real es el gate para permisos y recursos de Apple: si falla por permisos de la clave App Manager, certificado cloud o asociación de App Group, conservar el error exacto y verificar ese recurso antes de cambiar permisos o crear credenciales. No deducirlo de CI verde ni repetir ciegamente la subida.

Referencias: [firma de distribución de Apple](https://help.apple.com/xcode/mac/current/en.lproj/devff5ececf8.html), [certificados gestionados en la nube](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/), [entitlements y perfiles](https://developer.apple.com/library/archive/technotes/tn2415/), [subida con altool](https://help.apple.com/asc/appsaltool/en.lproj/static.html). La técnica del archivo local está descrita por el desarrollador que resolvió su CI en [Apple Developer Forums](https://developer.apple.com/forums/thread/756119); es evidencia de implementación, no una garantía de Apple para nuestra cuenta. Se valida con Xcode 26 en nuestra CI y luego con exportación real.

El workflow no publica en App Store. Antes de XcodeGen, prepara un icono provisional AppIcon de 1024 px, sin alfa, a partir del icono de la PWA, y usa «Window» como nombre visible en iPhone. Abre https://appstoreconnect.apple.com/apps > Window > TestFlight para ver el resultado del procesamiento de Apple. Si aparece el build, crea un grupo **Internal Testing** y añade tu usuario App Store Connect; instala [TestFlight](https://apps.apple.com/app/testflight/id899247664) en iPhone y acepta la invitación. No asumir éxito porque el job de GitHub muestre upload completado; **Apple debe procesarlo**.

Los primeros intentos podrían revelar errores de firma, permisos API, bundle IDs, perfiles de grupo, iconos/metadatos, versión Xcode o compatibilidad de extensiones. En esos casos revisar logs con cuidado, nunca copiar claves o tokens. Dejar los recibos y el estado de Apple como verdad.

## D. Criterios de aceptación del primer iPhone

La app actual integra una superficie nativa (Continuidad, Chat, Agenda), Share Extension/WidgetKit y un puente WKWebView a la **PWA completa**. Su intención es no perder nada de lo ya construido. Aun así, un wrapper WebKit **no prueba paridad**: comprobar acceso a Isabella real, planificación, Work/archivos, Threads, Lecturas/Sofía, memoria/recibos, notificaciones, teclado, navegación, descargas y el logout conjunto. La sesión web es independiente de la nativa; iniciar sesión en ambas con la **misma cuenta MINDS**. La captura de Share Extension queda local hasta que se complete #221; no se debe prometer que ya alimenta conocimiento en Supabase. APNs y funciones Watch siguen siendo trabajos posteriores.

El primer objetivo es tener un binario auténtico en el iPhone y abrir una matriz de pruebas; **no declarar producto terminado** tras el primer upload. No crear una segunda Isabella, no cambiar Source-First, permisos, datos de producción ni el alcance de Build 101.
