# Build 80 — Isabella Presence v0.1

Fecha: 4 de octubre de 2026.

## Objetivo

Build 80 saca la misma Isabella del interior de la PWA como una Presence nativa mínima sobre el desktop, sin crear otro agente, otro runtime, otra memoria ni otra autoridad.

El contrato de producto es:

> always available, not always visible

## Decisión de implementación

La v0.1 utiliza Tauri 2 como thin native shell. Tauri aporta únicamente propiedades del sistema operativo que la PWA no puede ofrecer honestamente: una ventana desktop always-on-top, tray, lifecycle independiente del navegador y capacidad de aparecer/ocultarse sin convertir MINDS en una aplicación flotante permanente.

La interfaz es HTML/CSS/JS local. No carga la PWA completa dentro de la ventana y no incorpora un segundo frontend funcional de Isabella.

## Arquitectura

```
MINDS / Supabase
      │
      ├── minds_capability_runs
      ├── minds_attention_events
      └── existing authenticated Edge Functions
              │
              ▼
    Isabella Presence Protocol
              │
              ▼
       Tauri thin shell
       ├── compact state
       ├── tray access
       ├── open MINDS
       └── cancel active run
```

La shell no conoce OpenAI, Astra, Luna ni ningún provider. Consume únicamente estados ya persistidos por MINDS.

## Convergencia de Presence

Build 79 tenía una Presence de trabajo en `ambient.js` basada en `minds_capability_runs`. Independientemente, Attention Economy ya poseía una ruta `ambient` basada en `minds_attention_events`.

Build 80 no crea un tercer concepto. La shell proyecta ambas fuentes bajo un único protocolo humano:

- capability state explica qué está haciendo Isabella;
- attention state explica qué merece estar presente ahora.

Attention Economy sigue siendo la única capa que decide `interrupt / briefing / ambient / silent`.

## Conversación y decisiones

Build 80 no duplica `isabella-chat`, Project Threads ni el protocolo de confirmación dentro de una mini ventana.

La Presence puede mostrar una pregunta bloqueante y llevar a Gari a Isabella para responderla. Esto conserva un solo lugar con memoria conversacional, proposals, permissions y Human Surface.

Un futuro build podrá ampliar controles inline solo si puede preservar exactamente esas mismas garantías sin bifurcar autoridad.

## Sesión

La shell inicia una sesión propia con el mismo Supabase Auth mediante email OTP. La sesión queda persistida en el WebView nativo y se refresca automáticamente.

Se usa exclusivamente la publishable key pública. RLS continúa siendo la frontera de lectura. No existe una credencial privilegiada en el cliente.

## Runtime

La shell observa `minds_capability_runs` mediante RLS. Para cancelar, invoca la función existente `isabella-capability-runtime` con `action=cancel` y el run id. No escribe estados de capability directamente.

El trabajo sigue ejecutándose en Supabase/OpenAI aunque Presence se cierre o falle.

## Attention

La shell observa `minds_attention_events` mediante RLS. Presenta `route=ambient` y, de `route=interrupt`, únicamente señales que requieren input del usuario. No sustituye Web Push ni vuelve a decidir urgencia.

El estado local `seen/hidden` de la shell es exclusivamente estado de presentación. No se interpreta como consumo, resolución ni prueba de que Gari haya leído el evento.

## Realtime

No se añade una migración Realtime en v0.1. El estado productivo actual publica `conversation_messages` pero no `minds_capability_runs` ni `minds_attention_events` en `supabase_realtime`.

La Presence usa polling ligero. Este transporte es reemplazable y no forma parte del contrato.

## Seguridad

La Capability de Tauri está restringida a la ventana `presence`. El frontend puede mostrar/ocultar/redimensionar su propia ventana, recibir eventos locales y abrir únicamente la URL pública de Isabella.

No expone comandos Rust de negocio. No existe acceso nativo a filesystem, shell, browser automation, clipboard, email ni otros side effects.

## Plataforma

La implementación es cross-platform desde el contrato: macOS, Windows y Linux comparten la misma shell. CI compila la crate nativa en las tres familias de sistema operativo.

La primera instalación real en un dispositivo puede hacerse cuando se quiera probar la experiencia desktop. El cierre de Build 80 exige que la arquitectura y el cliente sean compilables; no exige introducir signing/distribución como nueva infraestructura del producto.

## Invariantes

- una sola Isabella;
- un solo MINDS;
- no nuevo agent loop;
- no backend paralelo;
- no service role en desktop;
- no provider credentials en desktop;
- no autoridad nueva por existir una ventana nativa;
- Attention Economy conserva la decisión de interrupción;
- Capability Runtime conserva ejecución y persistencia;
- cerrar Presence nunca cancela trabajo;
- abrir Presence nunca modifica verdad de proyecto;
- idle permanece visualmente ausente.

## Criterio de aceptación

Build 80 pasa si una shell nativa compilable puede autenticarse como Gari, observar trabajo y señales autorizadas de MINDS, aparecer de forma mínima, ocultarse en idle, abrir Isabella y cancelar explícitamente un capability run sin duplicar runtime ni autoridad.

Falla si introduce otra Isabella, otra memoria, una API privilegiada, un service role local, acceso directo al provider o una segunda política de atención.
