# Isabella — cliente iOS privado

Cliente SwiftUI para un solo propietario. Supabase y MINDS siguen siendo el único backend y la fuente canónica de tareas, memoria y permisos.

## Implementado en esta rama

La pantalla de inicio de sesión solicita el código OTP al usuario ya registrado; no crea usuarios nuevos. La sesión se conserva en Keychain con protección ThisDeviceOnly. El cliente no contiene ningún secreto service_role. Solo utiliza la clave publicable de Supabase, diseñada para aplicaciones distribuidas.

La agenda muestra tareas reales recuperadas por REST bajo RLS. El chat reutiliza la Edge Function isabella-chat mediante surface chat_browser y un identificador UUID por turno, sin habilitar la ruta durable de texto que no dispone de herramientas. Se recuperan los mensajes de la conversación más reciente de Isabella.

Las propuestas únicas de creación o actualización de tareas pueden aprobarse mediante las RPC ya existentes, con recibo y lectura canónica. Las propuestas múltiples o de otro tipo no ejecutan acciones. La cancelación utiliza la decisión registrada en Supabase. Ante errores de transporte no se repiten automáticamente las llamadas al modelo ni las mutaciones.

Siri y Atajos incluyen abrir Isabella y consultar de forma read-only las tareas de hoy. No existen mutaciones Siri ni ejecución permanente en segundo plano. El servicio de notificaciones locales continúa disponible; APNs queda pendiente de la membresía de Apple y de su integración con Attention Economy.

## Instalación local

En un Mac instala Xcode y XcodeGen. En apps/isabella-ios ejecuta xcodegen generate, abre MINDS.xcodeproj, elige tu Apple Account en Signing & Capabilities y selecciona tu iPhone. Compila, instala y entra con el mismo correo de MINDS.

Apple Developer Program cuesta 99 USD/año antes de eventuales precios locales. La compilación de GitHub Actions solo demuestra que compila para simulador sin firma: aún faltan pruebas físicas autenticadas, firma y distribución TestFlight.

## Límites de aceptación

El chat y la agenda son un primer cliente nativo, no la sustitución completa de la PWA. Deben revisarse la continuidad entre superficies, el tratamiento de propuestas múltiples, restauración de revisiones pendientes, salida y reapertura de iOS, scopes de conversación y experiencia de Siri en dispositivo. No se considera aprobado Build 100 ni rendimiento SLO por este desarrollo.

No guardar certificados Apple, perfiles, claves privadas, service_role ni tokens de usuario en GitHub.

## Agenda nativa y notificaciones locales

La agenda muestra eventos y tareas canónicas desde Supabase. En el menú de Agenda puedes elegir Activar avisos locales; el sistema solicitará permiso. Solo entonces la app programa avisos de tareas futuras que tengan due_date y reminder_time. Los avisos pertenecientes a esta capa se identifican con un prefijo propio y pueden desactivarse sin borrar las notificaciones de otras apps. En logout se cancelan los avisos de esta capa.

Esta funcionalidad no es APNs: si una tarea cambia mientras la app está cerrada, los recordatorios locales se reconciliarán al volver a cargar la agenda. El servidor no envía notificaciones de cambios con esta capa. Siri incorpora una consulta read-only del próximo evento de MINDS, además de las tareas de hoy.
