# MINDS · Isabella iOS

Cliente nativo experimental de MINDS para iPhone.

La intención no es reescribir el agente. Supabase, memoria, conversaciones, rutinas, Feed, Sofía y las Edge Functions siguen siendo la infraestructura compartida. Este directorio sustituye progresivamente la capa Safari/PWA por una interfaz SwiftUI.

## Desarrollo gratuito

Apple permite compilar y probar la app en un iPhone propio con un Apple Account gratuito mediante Xcode Personal Team. Ese modo exige volver a aprovisionar e instalar periódicamente la app y no incluye toda la matriz de capacidades del Apple Developer Program.

El proyecto se describe con XcodeGen para poder versionarlo como texto y validar el cliente en CI sin guardar un .xcodeproj generado.

En macOS:

1. Instalar Xcode desde Apple.
2. Instalar XcodeGen: `brew install xcodegen`.
3. Desde este directorio ejecutar `xcodegen generate`.
4. Abrir `MINDS.xcodeproj`.
5. En Signing & Capabilities seleccionar el Apple Account personal y un iPhone propio.

La configuración de backend queda vacía en `Config/Base.xcconfig` a propósito. La siguiente fase conectará autenticación y las Edge Functions existentes sin introducir una API paralela.

## Arquitectura

El ORB grande pertenece al estado inicial. Cuando existe conversación, el mismo ORB vive en el toolbar nativo y no se superpone al transcript.

Los mensajes usan controles nativos y text selection del sistema. Esto elimina el workaround de WebKit que seleccionaba toda la página.

Las rutinas continúan ejecutándose server-side en Supabase. Las notificaciones locales pueden usarse gratuitamente para recordatorios cuyo horario ya conoce el dispositivo. APNs se añadirá cuando se active una membresía que soporte las capacidades remotas necesarias.
