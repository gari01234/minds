# Isabella iPhone sin Mac — TestFlight

Esta via usa un runner macOS de GitHub Actions. No requiere un Mac personal. Se ejecuta exclusivamente a mano desde main y requiere membresia Apple Developer activa.

## Pasos del propietario desde iPhone

Primero, instala Apple Developer desde App Store. Abre Account, inicia sesion con tu Apple Account y selecciona Enroll Now > Individual. Apple puede pedir verificacion de identidad, nombre legal, doble factor y pago. La cuota base es 99 USD al ano, con precio local en la inscripcion y renovacion automatica si se contrata desde la app.

Despues, en developer.apple.com/account identifica el Team ID y registra un App ID explicito para Isabella. El Bundle ID definitivo ha de coincidir con el que usaras en App Store Connect; no utilizar local.minds.isabella para distribuir.

En appstoreconnect.apple.com > Apps > + > New App crea la ficha iOS de Isabella con ese Bundle ID, antes de subir el primer build. Crear la ficha no exige publicar en el App Store.

En App Store Connect > Users and Access > Integrations > App Store Connect API, como Account Holder solicita acceso si fuera necesario y genera una Team API Key. No usar Individual API Key: las individuales no pueden utilizar los endpoints de aprovisionamiento necesarios para firma automatizada. Descarga el AuthKey_....p8: Apple solo permite descargarlo una vez. Nunca envies la clave ni contrasenas por chat o issues.

En github.com/gari01234/minds > Settings > Environments, crea el entorno apple-testflight. Configura dos variables en el entorno: ISABELLA_APPLE_TEAM_ID y ISABELLA_IOS_BUNDLE_ID. Configura tres secretos en el mismo entorno: ISABELLA_ASC_ISSUER_ID, ISABELLA_ASC_KEY_ID e ISABELLA_ASC_API_KEY_P8. El ultimo es el texto completo de la clave privada .p8 con sus lineas BEGIN/END PRIVATE KEY. Desde iPhone, Safari puede requerir Solicitar sitio web de escritorio para estos menus.

Ve a GitHub > Actions > Isabella iPhone — TestFlight (manual) > Run workflow. Selecciona main. El workflow verifica la configuracion antes de contactar Apple, genera Xcode con XcodeGen, solicita la firma remota de Apple, crea el archivo y envia el build a App Store Connect. No hay publicacion automatica al hacer commits.

En App Store Connect > Apps > Isabella > TestFlight, espera a que Apple procese el build, crea un grupo Internal Testing y agrega tu propio usuario. Instala TestFlight en iPhone, acepta la invitacion y prueba la app. Los builds de TestFlight caducan a los 90 dias; puedes subir otro desde GitHub.

## Alcance y seguridad

El workflow sin credenciales NO puede validar la firma real ni la subida; esa acceptance vendra despues de activar la membresia. Puede requerir ajustes por version de Xcode o permisos de Apple en el primer intento. El inicio de sesion nativo, acciones revisadas, notificaciones locales y Siri todavia requieren aceptacion fisica en el iPhone. Las notificaciones APNs originadas en Supabase son otro desarrollo.

La clave p8 vive solo en un secreto de entorno de GitHub y temporalmente en el runner; no se incorpora al repo. No se crean servicios backend ni una segunda Isabella.
