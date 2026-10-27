# Identidad de la aplicación · Window y dirección NIL

**Decisión del propietario · 27 de octubre de 2026.**

## Lo decidido

**Window** es el nombre elegido **por ahora** para la aplicación que se va a dar de alta en App Store Connect y probar mediante TestFlight. Es el nombre de la puerta de entrada, **no un reemplazo técnico del sistema**.

- **MINDS:** el sistema y su arquitectura cognitiva, de memoria y de trabajo.
- **Isabella:** la asistente y presencia personal dentro del sistema.
- **Window:** el nombre visible de la aplicación iPhone, provisional hasta aceptación comercial y técnica.

Esta decisión **no** autoriza a borrar nombres de módulos existentes ni a realizar una migración de rutas, tablas, identidad de datos, contenidos, ni a renombrar indiscriminadamente repositorio y código. El Bundle ID registrado y utilizado por iOS continúa siendo **`com.gari01234.minds`**, independientemente del nombre visible «Window». Los identificadores de las extensiones siguen siendo `com.gari01234.minds.share` y `com.gari01234.minds.widget`; el App Group sigue `group.com.gari01234.minds`. La disponibilidad de «Window» como nombre de ficha en App Store Connect y los posibles conflictos de marca aún deben comprobarse, no asumirse.

## La dirección futura: NIL — Nobody Is Looking

El propietario expresó explícitamente que **lo fundamental de NIL es la idea de «Nobody Is Looking», no la sonoridad ni el minimalismo del acrónimo**. Es una **aspiración de privacidad y libertad mental**: que pueda pensar, hablar, organizarse y guardar información personal sin observación o acceso no autorizado.

El producto debe evolucionar hacia una arquitectura cada vez más **local-first, controlable y verificablemente privada**. Investigar almacenamiento cifrado bajo control del dispositivo, funcionamiento sin conexión cuando sea viable, minimización de envío de datos, opciones explícitas para procesamiento local, permisos contextuales para cualquier transferencia, privacidad de notificaciones y widgets, y mecanismos auditables que permitan identificar qué se comparte, por qué y con quién. Establecer escenarios, límites técnicos, amenazas, aceptación y pruebas antes de presentar estas cualidades como garantías.

**NIL no es hoy un nuevo nombre aprobado ni una propiedad que MINDS pueda afirmar que ya cumple.** Hoy existe infraestructura Supabase y servicios externos de IA; «Nobody Is Looking» no debe convertirse en un reclamo absoluto falso. Avanzar hacia ese objetivo **no implica** sustituir inmediatamente Supabase ni desplazar los contratos canónicos, de identidad, memoria, Authority/Review, receipts, Source-First y permiso. Investigar migraciones progresivas y reversibles, preservando continuidad y datos.

En una fase futura se podrá decidir si NIL (o un nombre alternativo mejor) designa la aplicación, una arquitectura privada, un modo, una filosofía de producto o una generación nueva de Window. **No anticipar esa decisión.** Lo permanente, salvo nueva indicación del propietario, es el objetivo de privacidad, no el acrónimo.

## Implicación inmediata para TestFlight

Continuar la creación de la **ficha App Store Connect** con `Window` si el nombre es aceptado, plataforma iOS y Bundle ID **`com.gari01234.minds`**. No registrar otra familia de App IDs ni cambiar el App Group por este nuevo nombre. Mantener el contrato «**todo MINDS web + las integraciones Apple**» y exigir pruebas en iPhone real; «Window» no autoriza una app reducida ni un nuevo runtime.

**Estado de decisión:** nombre Window elegido provisionalmente; objetivo de privacidad NIL ratificado; disponibilidad de marca y nombre pendientes; ninguna migración o afirmación de privacidad total aprobada.
