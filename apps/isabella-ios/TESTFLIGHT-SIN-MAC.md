# Window · Primera instalación mediante TestFlight (sin Mac)

**Estado 29/10/2026, tras los runs #5 y #6:** archivo y exportación App Store Connect correctos, pero los tres targets exportados incumplen su requisito designado. El nombre exigido por ese requisito y la autoridad del certificado mostrada por `codesign` difieren y solo coinciden tras normalización Unicode NFC. El control de la PR #235 lo detecta y detiene la subida. La causa coincide con el fallo reproducido por Apple DTS en el reporte existente **FB24633162**; ver sección C.1. **No hay un build aceptado ni probado en iPhone.** El siguiente paso es contactar con Developer Programs por el nombre técnico del equipo y el certificado afectado. No repetir el mismo upload ni regenerar la API key. App IDs, App Group, ficha Window y clave Admin ya están configurados; el icono sigue siendo provisional.

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

**4 · App Store Connect API.** **Completado en la cuenta del propietario:** acceso aprobado. La primera Team API Key «Window TestFlight GitHub», rol App Manager, recibió un rechazo de firma cloud en el run #3. El propietario creó «Window TestFlight GitHub Admin», rol Administrator, y confirmó la sustitución de Key ID y contenido `.p8` en los secretos existentes de `apple-testflight`; el Issuer ID no cambió. Con esa clave el segundo intento exportó correctamente. Admin tiene permisos más amplios: esta sustitución respondió al error real de Apple, no a una regeneración preventiva. Conservar la clave anterior hasta verificar el flujo completo y después revisar su revocación con el propietario. No generar otra clave ni compartir el `.p8` en ChatGPT, Issues o el repositorio. Referencias: [permisos de firma cloud](https://developer.apple.com/documentation/appstoreconnectapi/userrole) y [roles de claves inmutables tras crearlas](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api).

**5 · GitHub Environment.** **Completado según capturas:** entorno `apple-testflight` restringido a `main`, dos variables y tres secretos. Para revisar: en https://github.com/gari01234/minds/settings/environments crea o abre `apple-testflight`. Configura *environment variables*:
- `ISABELLA_APPLE_TEAM_ID` = Team ID del paso 1.
- `ISABELLA_IOS_BUNDLE_ID` = Bundle ID principal exacto del paso 2.

Configura *environment secrets*:
- `ISABELLA_ASC_ISSUER_ID` = Issuer ID.
- `ISABELLA_ASC_KEY_ID` = Key ID.
- `ISABELLA_ASC_API_KEY_P8` = contenido completo de la clave privada `.p8` (incluyendo BEGIN/END).

Nunca uses un secreto de repositorio público para estos valores; se referencian solo en el job `distribute` ligado al entorno `apple-testflight`. Si GitHub permite revisores/branch restrictions de Environment, restringir a `main`. **No realizar `upload` antes de verificar que todos los pasos anteriores estén completos.**

## C. Primer TestFlight real

**Ahora hay un bloqueo de firma externo al build: resolver primero la sección C.1.** Una vez corregido el estado del nombre técnico/certificado, en el mismo workflow manual de GitHub elegir `main` y modo **`upload`**, una sola vez. El preflight de simulador debe pasar primero; luego se accede al entorno `apple-testflight` y se valida la configuración existente. No repetir el alta de App IDs, ficha, API key ni secretos.

El archivo para dispositivo se prepara con `CODE_SIGN_IDENTITY=-`, `AD_HOC_CODE_SIGNING_ALLOWED=YES` y `CODE_SIGN_STYLE=Automatic`, sin credenciales ni peticiones de aprovisionamiento en el comando de archivo. Esta firma local conserva los entitlements de app, Share y Widget; **no es la distribución Ad Hoc de Apple, no permite instalar el archivo y no requiere UDID**. `Release` por sí solo no selecciona distribución: en el run #2 se pidió desarrollo antes de llegar a la exportación. Desactivar toda firma con `CODE_SIGNING_ALLOWED=NO` en este archivo arriesgaría perder entitlements; se conserva únicamente en simulador.

La CI macOS comprueba los build settings efectivos de los tres targets y ejecuta el mismo archivo para dispositivo sin secretos. Después verifica firmas locales y sus requisitos internos, Bundle IDs, versiones, metadatos de ambas extensiones y App Group firmado. La primera ejecución del PR #233 logró `ARCHIVE SUCCEEDED` con Xcode 26.6 y detectó que las extensiones conservaban el build fijo `1` generado por XcodeGen, distinto del build de la app. Por eso los Info.plist de Share y Widget ahora usan `$(MARKETING_VERSION)` y `$(CURRENT_PROJECT_VERSION)`, igual que la app. Los ajustes de firma de desarrollo no cambian.

`xcodebuild -exportArchive` aplica `method=app-store-connect`, `destination=export` y firma automática con la API key existente: aquí Xcode solicita los perfiles de distribución y utiliza firma gestionada por Apple. Antes de subir, se inspecciona el IPA real con `codesign --verify --deep --strict --verbose=2` (incluido el requisito designado): las tres firmas deben tener autoridad Apple Distribution, el mismo equipo, identificadores exactos y el grupo `group.com.gari01234.minds`; cada perfil debe ser vigente, App Store/TestFlight, sin dispositivos ni depuración. Este control incluye explícitamente el Widget. Solo entonces `altool` sube ese mismo IPA. Ni perfiles ni IPA ni claves se publican como artifacts.

La exportación real es el gate para permisos y recursos de Apple: si falla por permisos de la clave App Manager, certificado cloud o asociación de App Group, conservar el error exacto y verificar ese recurso antes de cambiar permisos o crear credenciales. No deducirlo de CI verde ni repetir ciegamente la subida.

**Evidencia del run #3 (40853862606), código `7a0524f`:** [intento 1](https://github.com/gari01234/minds/actions/runs/40853862606/attempts/1), archivo de los tres targets correcto y exportación rechazada por permisos cloud. [Intento 2](https://github.com/gari01234/minds/actions/runs/40853862606/attempts/2), con la nueva clave Admin: `ARCHIVE SUCCEEDED`, tres recibos de archivo `0.1.0 (3)`, `EXPORT SUCCEEDED` y después `Signing validation failed: MINDS: no distribution signing authority`. La subida fue `skipped`; la clave temporal se eliminó. El perfil y los entitlements de la app principal pasaron antes de ese fallo, pero aún no se alcanzaron los controles de distribución de las extensiones. [Apple TN3161](https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates) documenta dos niveles de verbosidad para leer la cadena. La prueba nueva de CI macOS consulta la autoridad real de `/usr/bin/codesign`, firmado por Apple, sin credenciales de producción. El verificador conserva los controles de perfiles, depuración, equipo, versiones y App Group; únicamente corrige la lectura de la autoridad y exige que el primer certificado sea de distribución. Tras fusionar el ajuste hay que iniciar un run nuevo en `main`: reintentar el run #3 conservaría su código anterior.

**Evidencia del [run #4 (40888374576)](https://github.com/gari01234/minds/actions/runs/40888374576), código `6d3d5c2`:** preflight correcto; `ARCHIVE SUCCEEDED`, `EXPORT SUCCEEDED` y tres recibos de distribución `0.1.0 (4)`. El paso de subida recibió tres `90035`, uno por ejecutable, con «Code failed to satisfy specified code requirement(s)». También recibió `90360`: `CFBundleDisplayName` ausente en Share y Widget, y `NSExtensionActivationRule` ausente en Share. Hubo respuestas HTTP 500 intermedias, pero el resultado final fue un rechazo explícito de validación: no tratarlo como un fallo transitorio ni repetir ese mismo código.

Los metadatos corregidos dan a ambas extensiones el nombre visible Window y colocan los cuatro tipos ya admitidos por Share bajo `NSExtension > NSExtensionAttributes > NSExtensionActivationRule`, como documenta [Apple](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/AppExtensionKeys.html). El verificador comprueba los Info.plist compilados tanto en el archivo de CI como en el IPA exportado.

El control anterior `codesign --verify --strict` comprobaba el sello, pero no el requisito designado. [TN2206](https://developer.apple.com/library/archive/technotes/tn2206/) explica que la verificación verbosa evalúa también ese requisito. Una regresión macOS crea un ejecutable temporal con un requisito deliberadamente incompatible: el control anterior lo acepta y el nuevo debe rechazarlo. Si la firma exportada falla, se recogen los errores de los tres targets y un diagnóstico limitado (presencia de cdhash, comparación exacta y tras normalización Unicode del nombre exigido frente a la autoridad). No se imprimen nombres del titular, requisitos completos, perfiles ni claves. Esto distingue posibles causas; **no afirma que un problema Unicode ni un hash conservado sea la causa de Window sin observar el resultado**. No se modifica ni se debilita ningún requisito de firma. El siguiente run debe usar el nuevo `main`; solo llegará a `altool` si supera los controles reforzados. La aceptación de Apple y el procesamiento de TestFlight siguen pendientes.

Referencias: [firma de distribución de Apple](https://help.apple.com/xcode/mac/current/en.lproj/devff5ececf8.html), [certificados gestionados en la nube](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/), [entitlements y perfiles](https://developer.apple.com/library/archive/technotes/tn2415/), [subida con altool](https://help.apple.com/asc/appsaltool/en.lproj/static.html). La técnica del archivo local está descrita por el desarrollador que resolvió su CI en [Apple Developer Forums](https://developer.apple.com/forums/thread/756119); es evidencia de implementación, no una garantía de Apple para nuestra cuenta. Se valida con Xcode 26 en nuestra CI y luego con exportación real.

El workflow no publica en App Store. Antes de XcodeGen, prepara un icono provisional AppIcon de 1024 px, sin alfa, a partir del icono de la PWA, y usa «Window» como nombre visible en iPhone. Abre https://appstoreconnect.apple.com/apps > Window > TestFlight para ver el resultado del procesamiento de Apple. Si aparece el build, crea un grupo **Internal Testing** y añade tu usuario App Store Connect; instala [TestFlight](https://apps.apple.com/app/testflight/id899247664) en iPhone y acepta la invitación. No asumir éxito porque el job de GitHub muestre upload completado; **Apple debe procesarlo**.

Los primeros intentos podrían revelar errores de firma, permisos API, bundle IDs, perfiles de grupo, iconos/metadatos, versión Xcode o compatibilidad de extensiones. En esos casos revisar logs con cuidado, nunca copiar claves o tokens. Dejar los recibos y el estado de Apple como verdad.

### C.1. Bloqueo Unicode confirmado en los runs #5 y #6

Los runs [#5 / 40899368372](https://github.com/gari01234/minds/actions/runs/40899368372) y [#6 / 40908457243](https://github.com/gari01234/minds/actions/runs/40908457243) usaron `main` en `1c59caf`, con la PR #235. Ambos pasaron preflight, archivo de los tres targets y exportación App Store Connect; ambos fallaron en la verificación del IPA y omitieron la subida. En cada target el sello es válido en disco, pero no se satisface el requisito designado. El diagnóstico devuelve exactamente:

```json
{"cn_matches_after_nfc": true, "cn_matches_authority": false, "uses_cdhash": false, "uses_certificate_cn": true}
```

Esto confirma una diferencia de representación Unicode entre el CN exigido por el requisito y la autoridad mostrada por `codesign`. No se han publicado nombres del titular, certificados ni perfiles, ni se ha obtenido en este entorno un volcado DER del certificado. La evidencia coincide con el fallo reproducido por Apple DTS en [Apple Developer Forums, hilo 843700](https://developer.apple.com/forums/thread/843700), reporte de otro desarrollador **FB24633162**. Otro [hilo específico de firma cloud](https://developer.apple.com/forums/thread/848968) remite a esa misma respuesta. No atribuir el rechazo a los avisos de Node.js ni a la espera de runners macOS: son incidencias distintas.

Apple DTS indica contactar con [Apple Developer Support / Developer Programs](https://developer.apple.com/contact/) para retirar los caracteres no ASCII del **nombre técnico del equipo**, manteniendo el nombre legal. El hilo también aborda membresías individuales. Un participante confirmó que consiguió distribuir tras ese cambio y la sustitución de los certificados que aún llevaban el nombre anterior. Es una vía documentada; todavía no está aplicada ni validada para este equipo.

La petición debe identificar Team ID `B74XM2TH77`, membresía individual y Window (`com.gari01234.minds`, `.share`, `.widget`), citar `FB24633162` y solicitar confirmación de la corrección para esta cuenta. El formulario requiere iniciar sesión con Apple. **No se ha enviado aún una solicitud ni existe un número de caso propio.** Evitar cambiar el nombre legal, el nombre de la app o los Bundle IDs como supuesto arreglo. La [guía de actualización de cuenta](https://developer.apple.com/help/account/membership/updating-your-account-information/) distingue el nombre del Apple Account de los datos de la membresía: editar el primero no corrige por sí solo el segundo.

Tras la confirmación de Apple, identificar el certificado cloud de distribución que conserva el nombre anterior y revisar su alcance antes de sustituirlo. No revocar certificados en bloque ni la API key. La [revocación invalida los perfiles que incluyen ese certificado](https://developer.apple.com/help/account/certificates/revoke-a-certificate/); coordinar el certificado concreto y sus perfiles con el propietario/soporte. Un cambio de nombre no reescribe certificados ya emitidos. Después, una nueva exportación debe producir firmas que satisfagan sus requisitos y superar los controles de los tres targets antes de subir. La aceptación y procesamiento de TestFlight se verifican aparte.

Se contrastó la alternativa de firma local: Apple permite [usar un certificado Apple Distribution con clave privada en el llavero del runner](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/). Un desarrollador documentó [re-firma con un requisito basado en Team ID/OU](https://stefanomondino.com/posts/a-grave-accent-broke-my-testflight-upload/) para evitar el CN Unicode. No se ha implementado ni probado esa alternativa aquí: requiere una identidad privada local y un flujo de firma distinto. No fingir que basta normalizar el texto después de exportar, ni saltar la verificación: cambiar el requisito exige una firma válida nueva.

La CI de #235 y de `main` pasó en Xcode 26.6: once pruebas sin omisiones, simulador y archivo local de los tres targets. Las versiones de archivo se verificaron como `0.1.0 (42)` y `0.1.0 (43)` en CI; los runs reales fallidos usaron builds `5` y `6`. Los metadatos ausentes del run #4 ya están corregidos. El éxito local no valida una firma cloud generada después.

### C.2. Firma local en el runner (modo `upload-local-signing`, 1/11/2026)

Alternativa que no espera a Apple. El mismo workflow tiene un tercer modo, **`upload-local-signing`**:
1. Archiva igual que antes (firma ad hoc local que conserva los entitlements).
2. Retira primero los certificados y perfiles que dejaron runs anteriores de este mismo modo (perfiles «Window CI …»), para no acumular certificados.
3. Con la API key existente crea en el runner una clave RSA y su CSR, pide a Apple un certificado **Apple Distribution** y crea tres perfiles **App Store** (app, `.share`, `.widget`) con ese certificado. La clave privada solo vive en un llavero temporal del runner.
4. Firma con `/usr/bin/codesign` directamente: extensiones primero y la app después. La identidad se pasa por su huella SHA-1, sin el nombre con acentos, y codesign deriva el requisito designado del propio certificado. Si aun así no se cumple, vuelve a firmar con un requisito ASCII basado en el Team ID.
5. Pasa el mismo verificador `distribution` (autoridad, equipo, perfiles App Store, App Group, requisito designado). Solo entonces sube con `altool`.
6. Al final borra el llavero, la clave y los ficheros temporales. El certificado y los perfiles quedan en la cuenta hasta el siguiente run de este modo, que los retira (así el procesamiento de Apple nunca encuentra un certificado revocado).

No toca el certificado cloud ni los perfiles gestionados por Xcode, ni cambia la API key, los Bundle IDs o la ficha. Si Apple rechaza crear el certificado (límite de certificados de distribución), el error queda en el log.

## D. Criterios de aceptación del primer iPhone

La app actual integra una superficie nativa (Continuidad, Chat, Agenda), Share Extension/WidgetKit y un puente WKWebView a la **PWA completa**. Su intención es no perder nada de lo ya construido. Aun así, un wrapper WebKit **no prueba paridad**: comprobar acceso a Isabella real, planificación, Work/archivos, Threads, Lecturas/Sofía, memoria/recibos, notificaciones, teclado, navegación, descargas y el logout conjunto. La sesión web es independiente de la nativa; iniciar sesión en ambas con la **misma cuenta MINDS**. La captura de Share Extension queda local hasta que se complete #221; no se debe prometer que ya alimenta conocimiento en Supabase. APNs y funciones Watch siguen siendo trabajos posteriores.

El primer objetivo es tener un binario auténtico en el iPhone y abrir una matriz de pruebas; **no declarar producto terminado** tras el primer upload. No crear una segunda Isabella, no cambiar Source-First, permisos, datos de producción ni el alcance de Build 101.
