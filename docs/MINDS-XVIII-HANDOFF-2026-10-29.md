# MINDS XVIII · Handoff operativo integral
**Fecha de corte:** jueves, 29 de octubre de 2026 · Europe/Berlin  
**Repositorio canónico:** [gari01234/minds](https://github.com/gari01234/minds)  
**Último HEAD de main verificado:** `d365a4f8104daa3a18c099f293cde5582a5a1f62`  
**Foco operativo inmediato:** desbloquear la primera distribución firmada de **Window** en TestFlight.  
**Naturaleza:** snapshot documental y continuidad entre chats, no una release, ni una autorización de migración o modificación de producción.

> **Para retomar:** No volver a registrar la app, los App IDs, la API key ni los secretos de GitHub. Todo eso ya está configurado según capturas. La ejecución de GitHub Actions **TestFlight #2 / run 40721375717** concluyó con **failure** el 28/10/2026: preflight exitoso y fallo en **Archive using Apple's automatic signing** por ausencia de *iOS App Development provisioning profiles* y mensaje de Apple sobre no tener dispositivos de desarrollo registrados. El paso de subida NO se ejecutó. Hay que resolver **firma de distribución App Store Connect para los tres targets**; no confundir TestFlight con instalación de desarrollo en un iPhone registrado.

## 1. Naturaleza, propósito e identidad del proyecto

**MINDS** es una infraestructura cognitiva personal de un único propietario. Integra trabajo, agenda, tareas, proyectos, documentos, memoria, conversaciones, lecturas, investigación, ideas, planes, notificaciones y acceso a fuentes, sin que el usuario tenga que reconstruir continuamente contexto y procedencia. No es un producto SaaS multiusuario ni una app genérica para múltiples asistentes.

**Isabella** es la única asistente personal, conversacional y operativa, específica para el usuario. Su objetivo incluye proactividad y continuidad personal, no solo productividad: un lenguaje natural, familiaridad creciente, iniciativa alta, humor cuando corresponde, desacuerdo razonado sin insistencia, respeto por decisiones y permisología explícita. El usuario ya cerró la calibración mediante un Relationship Contract; no volver a imponer cuestionarios por defecto.

**Window** es el nombre **actual y provisional** de la aplicación iOS; Apple lo aceptó al crear su ficha en App Store Connect el 28/10/2026. Dentro de Window sigue estando Isabella y bajo ella MINDS. No se autorizó renombrar indiscriminadamente el repositorio, los módulos, las rutas, las tablas ni los identificadores de Apple. En `apps/isabella-ios/project.yml`, el nombre instalado `CFBundleDisplayName` ya es **Window**.

**NIL**, abreviatura de *Nobody Is Looking*, es una **dirección futura de producto**, motivada ante todo por la posibilidad de pensar, registrar y vivir en un espacio digital donde nadie pueda observar sin autorización. No es un simple ejercicio de branding ni un renombramiento aprobado. Supone investigar progresivamente procesamiento y almacenamiento local-first, cifrado, permisos y transmisiones explícitas, control sobre salida de datos y garantías auditables. **No afirmar que NIL ya existe**: la arquitectura actual utiliza Supabase y servicios externos de IA. Preservar continuidad, fuentes y seguridad al investigar migraciones.

Fuente: [decisión de nombre y dirección NIL](PRODUCT-NAME-WINDOW-NIL-2026-10-27.md).

## 2. Invariantes constitucionales y de producto

1. **Una única fuente canónica y un único runtime de autoridad**: Supabase de producción `lodexwyyynlarkqgkyhy`; `native_minds` sigue siendo el runtime canónico. Herramientas, proveedores, modelos y Skills aportan capacidad, no autoridad. No crear una segunda Isabella ni memoria paralela en iOS.
2. **Source-First, provenance, receipts y revisión humana**: distinguir fuente original, extracción, interpretación propuesta, afirmaciones confirmadas, feedback y memoria autobiográfica. No convertir sugerencias de IA o capturas compartidas en creencias o acciones aceptadas silenciosamente. Un HTTP ambiguo no autoriza repetir mutaciones.
3. **Acciones conversacionales**: transiciones justificadas, permisos y scopes estrictos, corrección sin duplicación, propuestas frente a acciones ejecutadas, atención y notificaciones bajo Attention Economy. Review Economy busca reducir fricción sin sustituir la autoridad del usuario.
4. **Semántica temporal**: la tarea canónica, su sesión de trabajo, la estimación, la reserva y los minutos por colaborador son entidades diferentes. No inventar disponibilidad, jornada laboral ni capacidad.
5. **Cobertura del conocimiento**: la optimización de tokens/contexto nunca debe sacrificar acceso a conocimiento. Una recuperación parcial no equivale a conocer todo MINDS; ampliar búsqueda, buscar evidencia cruzada y evidenciar huecos.
6. **La app iPhone tiene que dar acceso a TODO lo que la webapp tiene, MÁS las integraciones Apple.** No se permite sustituirla por una app reducida. Las pantallas SwiftUI pueden diferir visualmente, pero no perder datos, historia, funciones ni autorización. Puente `WKWebView` transitorio hasta aceptación empírica de paridad real.
7. **No confundir estados**: propuesta ≠ implementación ≠ CI verde ≠ merge ≠ publicación ≠ aceptación en dispositivo. La primera compilación firmada tampoco demuestra paridad.
8. **Permisos y secretos**: nunca pedir ni copiar a chat credenciales de Apple, archivo `.p8`, service-role, JWT, certificados o perfiles privados. Los secretos de TestFlight se guardan en GitHub Environment.
9. **Método**: PRs pequeños, deterministas, verificables, con cambios mínimos y sin placeholders; comprobar estado vivo antes de actuar. El usuario no tiene Mac y no necesita seguir instrucciones de programación complejas si pueden hacerse mediante GitHub. En Apple, si hay intervención manual, guiar una pantalla a la vez, aprovechando las capturas.

Contrato principal: [IOS-FUNCTIONAL-PARITY-v0.1](IOS-FUNCTIONAL-PARITY-v0.1.md). Entrada general: [README del repositorio](../README.md).

## 3. Arquitectura y superficies que ya existen

- **Isabella web/PWA**: https://gari01234.github.io/minds/isabella/; código `apps/isabella/`. Incluye Isabella Chat, situación/ahora, calendario día/semana/mes, tareas, sesiones, Work/Threads, ideas, propuestas, herramientas, notificaciones, memoria, archivos y acceso a otras superficies. La PWA es funcionalmente más extensa que SwiftUI hoy.
- **THEORY//LAB / Lecturas / Sofía**: https://gari01234.github.io/minds/theory/; código `apps/theory/`. Lectura completa, notas, subrayados, citas, contexto, conversaciones sobre pasajes, memoria viva de investigación, genealogía de hipótesis, exégesis separada de teoría propia. MINDS y Lecturas son espacios centrales en este subproyecto. No comprimir la memoria de lectura en un resumen de resumen.
- **Isabella Presence**: `apps/isabella-presence/`, shell desktop fina, sin runtime o autoridad separada. Se usa para acceso y continuidad, no para reconstruir MINDS.
- **Window nativa iOS**: `apps/isabella-ios/`, proyecto XcodeGen `project.yml`; targets `MINDS`, `MINDSShare`, `MINDSWidget`. SwiftUI ofrece Continuidad, chat y agenda de cobertura parcial; puente a PWA completa; captura de Share Extension offline en App Group, widget con conteos privados y TTL; Siri/Atajos básicos de solo lectura. No asumir que Share ya envía capturas al backend, ni APNs terminado, ni Apple Watch implementado.
- **Supabase**: `supabase/`; Auth, datos de Work/calendario, conversaciones, Edge Functions `isabella-chat`, capability runtime, knowledge coverage, recuperación, Attention Economy y receipts. Fuente única de datos/autorización de todas las superficies.
- **Pruebas e infraestructura**: `tests/`, `.github/workflows/`, scripts de publicación. Las pruebas iOS de simulador y los contratos no sustituyen aceptación física.

**Sesión**: inicio de sesión WebKit y sesión OTP/Keychain nativa separados; usar misma identidad real, no inyectar JWT nativo en JavaScript. Al cerrar sesión nativa limpiar también estado web embebido. Sitios externos abren Safari, privilegios JS no añadidos.

**Diseño**: `docs/MINDS-EXPERIENCE-ARCHITECTURE-v0.1.md` y documentos hermanos de navegación/aceptación, más Design Lab B1/B2, son propuestas exploratorias, **no un rediseño implementado**. El iPhone conserva la filosofía de continuidad antes de optimizar pantallas.

## 4. Estado GitHub y trazabilidad técnica verificada al corte

- Repo `gari01234/minds`; **main HEAD `d365a4f8104daa3a18c099f293cde5582a5a1f62`** (verificado en GitHub el 29/10).
- **PR #229** (27/10), merged: workflow TestFlight en Xcode 26, preflight y manual upload seguro; sin firma/instalación aceptada entonces.
- **PR #230** (27/10), merged en `dea1541a12b6e6be0a5ffd130cd082b01a177fe4`: formaliza identidad **Window/MINDS/Isabella**, dirección **NIL**.
- **PR #231** (28/10), merged en el HEAD actual `d365a4f...`: cambia el nombre visible instalado a **Window**, genera icono **provisional** de 1024 × 1024 px sin alfa a partir del PNG de la PWA, añade catálogo AppIcon, prepara recurso en CI y workflow, añade test y actualiza runbook. No renombra Bundle IDs ni altera Supabase.
- GitHub **Verify MINDS**, SQL y Chromium del PR #231: aprobados. `Validate MINDS iOS` run #36 y `Publish MINDS` run #513, sobre HEAD actual, terminados exitosamente. **Publicar la PWA no implica haber publicado Window**.
- `Isabella iPhone — TestFlight (manual)` run #1, modalidad **preflight**, 28/10: **success**, SHA histórico `dea1541...`.
- `Isabella iPhone — TestFlight (manual)` **run #2**, modalidad **upload**, iniciado 28/10/2026 15:58:44Z, finalizado 16:10:55Z: **failure**, SHA `d365a4f...`. **Preflight success; distribute failure**. URL: https://github.com/gari01234/minds/actions/runs/40721375717.
- Al corte no hay otro run posterior en la lista consultada. **Ningún IPA subido a TestFlight está confirmado.** No existe aceptación en iPhone.

No volver a evaluar Builds 71–100A.5 desde cero salvo una regresión o dependencia concreta. El README del repo explica su genealogía. **Build 101** corresponde a *Daily & Weekly Workload Intelligence* y es independiente del trabajo iOS, aunque emplea la misma fuente canónica. El handoff histórico MINDS XVII (21/10) documentaba Builds 96–99B, 99C y riesgos de esquemas; es un snapshot anterior, **no asumir** que sus pendientes siguen vigentes sin comprobar producción. No confundir la numeración de builds con run numbers de GitHub Actions.

## 5. Apple Developer y App Store Connect: YA CONFIGURADOS

El usuario tiene Apple Developer Program **activo** como Account Holder (membresía reportada hasta 26/10/2027). **No tiene un Mac**; se compila en GitHub-hosted macOS 26 / Xcode 26.6.

**Team ID**: `B74XM2TH77`. Identificadores registrados:

| Componente | Apple ID explícito |
| --- | --- |
| App principal, nombre App ID «MINDS Isabella», nombre App Store «Window» | `com.gari01234.minds` |
| Share Extension | `com.gari01234.minds.share` |
| Widget Extension | `com.gari01234.minds.widget` |
| App Group existente | `group.com.gari01234.minds` |

Capturas confirmaron los tres App IDs y App Group. El usuario vinculó el grupo a la app y Share; **no hay evidencia concluyente en captura de la asociación final del Widget al App Group**. Antes de asumir entitlements firmados, verificar en Apple Developer o con perfiles/archivado.

Para app principal el usuario habilitó App Groups, Push Notifications, Siri y WeatherKit en Apple Developer. **Habilitar una capability no demuestra implementación funcional**. Share/Widget tienen App Groups. Si la firma requiere ajustar capabilities y provisioning, hacerlo tras verificar el portal.

**App Store Connect**: ficha **Window**, plataforma iOS, Bundle ID principal `com.gari01234.minds`, idioma primario español (México), SKU `MINDS-IOS-001`, acceso completo. Registrada; estado visto: «Prepare for Submission» / `In Vorbereitung zur Übermittlung`. Registro **no equivale a publicación**. Nombre Window fue aceptado por Apple al crear ficha; revisión de marca comercial separada y no concluida.

**App Store Connect API**: acceso solicitado y aprobado. Team API Key llamada `Window TestFlight GitHub`, rol **App Manager**. El usuario descargó una vez el `.p8` y lo guardó en local; NO tiene que repetir ni mostrar el contenido. Issuer ID y Key ID existen; evitar copiarlos a documentos públicos innecesariamente.

**GitHub Environment**: `apple-testflight`, permitido **solo desde `main`**. URL de configuración: https://github.com/gari01234/minds/settings/environments. Variables de entorno:
- `ISABELLA_APPLE_TEAM_ID` = `B74XM2TH77`.
- `ISABELLA_IOS_BUNDLE_ID` = `com.gari01234.minds`.

Tres **environment secrets** creados por el usuario, presencia verificada mediante captura:
- `ISABELLA_ASC_ISSUER_ID`
- `ISABELLA_ASC_KEY_ID`
- `ISABELLA_ASC_API_KEY_P8`

El workflow `.github/workflows/ios-testflight.yml` usa **preflight** y **upload** por `workflow_dispatch`; `distribute` solo se ejecuta en `main`, tras preflight y con entorno `apple-testflight`. La clave se guarda temporalmente en el runner y se destruye en un paso `always()`. La conexión GitHub disponible en este chat permite leer GitHub, crear PR/merge, revisar logs, pero **no tenía acción expuesta para iniciar un workflow_dispatch**; la activación `upload` fue hecha por el usuario. En un chat nuevo, descubrir las capacidades reales del conector antes de afirmar que puede hacerlo directamente.

## 6. FALLO EXACTO DE TESTFLIGHT #2 (diagnóstico confirmado con los logs)

Link al job fallido: https://github.com/gari01234/minds/actions/runs/40721375717/job/122939644420  
Run ID `40721375717` · Job ID `122939644420` · `main` SHA `d365a4f...`.

En `distribute`, estos pasos **pasaron**:
- Validación de variables/secretos Apple y sus formatos.
- Reconstrucción temporal de la clave de firma `.p8` y test OpenSSL.
- Preparación del icono provisional de Window.
- Generación del proyecto XcodeGen.

Falló el paso **«Archive using Apple's automatic signing»** durante `xcodebuild archive -destination 'generic/platform=iOS' -allowProvisioningUpdates ... CODE_SIGN_STYLE=Automatic`, con Xcode 26.6. El registro contiene:

```text
Communication with Apple failed: Your team has no devices from which to generate a provisioning profile.
No profiles for 'com.gari01234.minds.widget' were found:
Xcode couldn't find any iOS App Development provisioning profiles ...
No profiles for 'com.gari01234.minds.share' were found ...
No profiles for 'com.gari01234.minds' were found ...
** ARCHIVE FAILED **
Process completed with exit code 65.
```

Es decir, Xcode buscó **perfiles de desarrollo** para tres targets y Apple indicó que el equipo carece de dispositivos de desarrollo registrados para generarlos. **Esto NO prueba que el código Swift esté mal, ni que la credencial API sea inválida**, pero tampoco prueba que existan certificados/perfiles de distribución autorizados. Faltó la fase de firma/archivo; las acciones `Assert both extensions ...`, `Prepare export` y `Upload signed archive` quedaron **skipped**. La clave temporal sí se destruyó.

**Clave de interpretación:** Apple distingue *Development/Ad Hoc*, que requiere dispositivos registrados, de *App Store Connect/TestFlight*, que se distribuye mediante firma de **distribución** y no precisa registrar el iPhone del tester como dispositivo de desarrollo. NO empezar por pedir un UDID ni añadir dispositivos sin investigar el flujo adecuado. Referencias oficiales:
- https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile
- https://help.apple.com/xcode/mac/current/en.lproj/devff5ececf8.html
- https://help.apple.com/xcode/mac/current/en.lproj/dev31de635e5.html
- https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution

**Ruta de reparación recomendada, NO implementada ni validada aún:**

1. Auditar `apps/isabella-ios/project.yml` y `.github/workflows/ios-testflight.yml` para explicar **por qué la Release archive pide iOS App Development profiles** a pesar de apuntar a TestFlight. Obtener build settings efectivos para `MINDS`, `MINDSShare` y `MINDSWidget` (identidad de firma, perfiles, team, `CODE_SIGN_STYLE`, `CODE_SIGN_IDENTITY`, entitlements), sin imprimir secretos.
2. Ajustar en PR mínimo el **camino de distribución** y firma para los tres targets. Considerar una identidad de firma *Apple Distribution* o una configuración Release específica y aprovisionamiento de distribución. No presumir que forzar una sola variable resuelve certificados o permisos. Mantener build de simulador unsigned, sin alterar la PWA ni Supabase.
3. Si el firmado automático con API key App Manager no consigue generar los recursos de distribución, **verificar** en portal la existencia de un certificado Apple Distribution, perfiles **App Store Connect** de los tres App IDs y permisos de la clave/rol. Apple documenta creación de perfiles de distribución por Account Holder/Admin. Si hacen falta certificados y perfiles manuales, diseñar un flujo seguro para macOS runner, certificados privados/p12 y acceso a GitHub Environment; nunca publicar secretos ni improvisar archivos falsos.
4. Verificar para cada perfil/capability App Groups, entitlements, Bundle ID y contenido firmado de las dos extensiones. En particular confirmar asociación Widget → App Group.
5. CI/PR sobre `main`, luego **un solo nuevo workflow manual** `mode=upload`; inspeccionar su resultado real. No repetir el upload fallido tal como está: reproducirá el mismo error.
6. Si archive/export/upload pasan, ir a App Store Connect → **Window → TestFlight** y verificar procesamiento de Apple; crear grupo **Internal Testing**, añadir usuario del propietario de App Store Connect e instalar TestFlight en iPhone. El job verde no confirma procesamiento ni instalación.

## 7. Pendientes funcionales después del primer TestFlight

La distribución es solo el primer hito. **No afirmar que Window ya ofrece paridad demostrada**. Matriz mínima de aceptación real en iPhone, con la misma cuenta MINDS en native y WebKit: Chat e historia/recuperación, Work/Threads, tareas/agenda/sesiones/recurrencia/planificación, Situación, Lecturas/Sofía, uploads y sobre todo **downloads** de documentos, fuentes y provenance, acciones y receipts, interrupción/reanudación, logout, navegación en/salida de WebKit, enlaces externos, teclado y gestos, micrófono, notificaciones, widget/Share Extension, aislamiento de datos. Registrar defectos y recibos antes de cerrar una fila de paridad.

Seguimiento de issues, todos **abiertos al 29/10**:
- [#212](https://github.com/gari01234/minds/issues/212): paraguas iOS vNext.
- [#205](https://github.com/gari01234/minds/issues/205): integración iPhone/Siri/servicios Apple.
- [#221](https://github.com/gari01234/minds/issues/221): admisión de capturas Share en MINDS con original, destino, review y Source-First; **captura local actual NO llega automáticamente a memoria Supabase**.
- [#219](https://github.com/gari01234/minds/issues/219): APNs bajo Attention Economy; evitar notificaciones duplicadas con PWA.
- [#220](https://github.com/gari01234/minds/issues/220): Watch solo si hay dispositivo real compatible y autorización.
- [#113](https://github.com/gari01234/minds/issues/113): cobertura cognitiva/evidencia de lo que Isabella puede recuperar; no cerrar por optimizar tokens.
- [#138](https://github.com/gari01234/minds/issues/138): integridad de las acciones conversacionales, scopes, receipts y latencia.
- [#204](https://github.com/gari01234/minds/issues/204): coste y prefetch excesivo de Work sin sacrificar evidencia.

Las investigaciones previas sobre reducción de conocimiento, Source-First, memoria autobiográfica, asistencia relacional y diseño de experiencia siguen siendo importantes; **no deben absorber el frente operativo inmediato** antes de obtener la primera firma y aceptación.

## 8. Procedimiento inmediato para el próximo chat

**Comenzar literalmente por aquí**:

> «Continúa MINDS XVIII. El último `main` verificado es `d365a4f8104daa3a18c099f293cde5582a5a1f62`. La subida TestFlight run #2 `40721375717` terminó en failure; preflight success; `distribute` falló en `xcodebuild archive` porque Xcode 26.6 solicitó perfiles iOS App Development para `com.gari01234.minds`, `.share`, `.widget`, mientras Apple reportó que no hay dispositivos de desarrollo registrados. El upload fue skipped. Ya existen App IDs, App Group, ficha Window, API key y GitHub Environment con sus secretos; no los reconfigures ni solicites claves. Audita la firma de distribución en `project.yml` y `ios-testflight.yml`, prepara un PR mínimo y verificable, comprueba CI y coordina un único nuevo upload. Mantén Window como nombre iOS, MINDS como sistema, Isabella como asistente, NIL como aspiración futura. No reduzcas la app respecto a la PWA». 

**Primero**, verificar HEAD, run e issues vivos; si hubo avances posteriores, reconciliarlos y no pisarlos. **Segundo**, diagnosticar firma contra logs y documentación oficial Apple; no plantear que el usuario registre UDID como requisito de TestFlight. **Tercero**, implementar revisión de firma en PR, comprobar macOS CI y contracts, luego merge si los gates apoyan. **Cuarto**, ejecutar manualmente upload solo cuando la configuración sea coherente. **Quinto**, inspeccionar TestFlight en App Store Connect y prueba iPhone.

### Fuentes operativas principales

- [Repo GitHub](https://github.com/gari01234/minds)
- [Workflow manual TestFlight](https://github.com/gari01234/minds/actions/workflows/ios-testflight.yml)
- [Run #2 fallido](https://github.com/gari01234/minds/actions/runs/40721375717)
- [Job distribute fallido](https://github.com/gari01234/minds/actions/runs/40721375717/job/122939644420)
- [PR #231 · Window name + provisional AppIcon](https://github.com/gari01234/minds/pull/231)
- [PR #230 · Window + NIL](https://github.com/gari01234/minds/pull/230)
- [Guía sin Mac](../apps/isabella-ios/TESTFLIGHT-SIN-MAC.md)
- [Paridad funcional iOS](IOS-FUNCTIONAL-PARITY-v0.1.md)
- [Arquitectura de experiencia](MINDS-EXPERIENCE-ARCHITECTURE-v0.1.md)
- [Control de identidad Window/NIL](PRODUCT-NAME-WINDOW-NIL-2026-10-27.md)
- [Apple App Store Connect — Window](https://appstoreconnect.apple.com/apps)
- [GitHub Environment](https://github.com/gari01234/minds/settings/environments)

**Última distinción:** este handoff actualiza el estado de la distribución iOS hasta el 29/10/2026, pero no sustituye las migraciones, decisiones de arquitectura ni los registros de cada Build como evidencia. Ninguna modificación de producción o nueva clave está autorizada por la mera existencia del documento.
