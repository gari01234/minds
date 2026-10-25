# MINDS

**Estado al 25 de octubre de 2026.** MINDS es una infraestructura cognitiva personal con una única fuente canónica (Supabase), varias superficies y una única Isabella como interfaz conversacional y operativa. Su objetivo es que el propietario pueda soltar una fuente, idea, obligación o trabajo sin perder su contexto, su procedencia ni su continuidad.

## Aplicaciones y superficies actuales

- **Isabella PWA** — [abrir](https://gari01234.github.io/minds/isabella/); código en `apps/isabella/`. Contiene conversación, Situación, Tiempo/Calendario, Work/Threads, Ideas, capacidad material, notificaciones y acceso a Lecturas/Thoughts.
- **THEORY//LAB · MINDS y Lecturas / Sofía** — [abrir](https://gari01234.github.io/minds/theory/); código en `apps/theory/`. Conserva el ámbito de lectura, ideas, annotations, fuentes y conversaciones asociadas.
- **Isabella Presence** — `apps/isabella-presence/`: shell nativa fina desktop, subordinada a estados y permisos canónicos.
- **Cliente iOS** — `apps/isabella-ios/`: SwiftUI con Continuidad, Chat y Agenda nativos, extensiones Share/Widget y un puente integrado a la PWA completa. **No ha alcanzado todavía equivalencia funcional nativa ni aceptación firmada en iPhone.**
- **Backend** — `supabase/`: Edge Functions, migraciones, memoria, Project Model, Commitments, Missions, Expectations, Authority/Review, Attention Economy, Work Source-First, capability runtime y recibos.
- **Biblioteca y pruebas** — `apps/isabella/skills/`, `apps/theory/skills/`, `tests/`, `.github/workflows/`, `docs/`.

## Contratos constitucionales

Supabase es fuente de verdad. Las pantallas y agentes externos son clientes y ejecutores, no bases paralelas de datos o permisos. `native_minds` sigue siendo el runtime canónico; los proveedores/modelos/Skills suministran capacidad, nunca autoridad. Separar fuente original, extracción, interpretación propuesta, conocimiento confirmado y memoria autobiográfica. Preservar scope de acceso, versiones, evidencia y recibos; un HTTP ambiguo no autoriza reejecutar mutaciones.

Una tarea es la misma entidad en Tiempo/Work/Isabella; una sesión, estimación, reserva y asignación a una persona no son equivalentes. Attention Economy decide cómo interrumpir. Review Economy reduce carga de confirmación sin conceder autoridad. La personalidad de Isabella es específica para su propietario y no persigue engagement artificial.

**Decisión iOS (25/10/2026):** la app móvil debe ofrecer **todo lo que existe en la webapp más las integraciones Apple**. No se acepta una versión recortada. Véase [contrato de equivalencia iOS](docs/IOS-FUNCTIONAL-PARITY-v0.1.md). Un puente WebKit da acceso transitorio al producto existente, pero no demuestra por sí solo paridad de login, descargas, archivos, gestos o notificaciones: requiere TestFlight/E2E.

## Diseño de experiencia · estudio v0.1 (propuesta, no aplicado)

La interfaz actual está documentada y evaluada como un sistema completo, a partir de trece capturas reales y del código web/iOS: [arquitectura de experiencia e inventario de superficies](docs/MINDS-EXPERIENCE-ARCHITECTURE-v0.1.md), [alternativas de navegación](docs/MINDS-NAVIGATION-OPTIONS-v0.1.md) y [criterios de aceptación por recorridos](docs/MINDS-EXPERIENCE-ACCEPTANCE-v0.1.md). Los tres documentos son **hipótesis de diseño para validación**, no un rediseño ya aprobado ni una modificación de permisos, runtime o navegación. Se conserva la equivalencia funcional PWA→iPhone.

## Estado y aceptación

El histórico de Builds 71–100A.5 está en el repositorio y en sus PRs. No confundir diseñado, implementado, tests/CI, fusionado, desplegado y aceptado en dispositivo. Las prioridades transversales abiertas incluyen [#113 Knowledge Coverage](https://github.com/gari01234/minds/issues/113), [#138 integridad conversacional](https://github.com/gari01234/minds/issues/138), [#204 coste/contexto Work](https://github.com/gari01234/minds/issues/204) y [#212 iOS vNext](https://github.com/gari01234/minds/issues/212). Build 101 conserva el significado **Daily & Weekly Workload Intelligence** y no se renombra como iOS.

Pruebas principales: `node --test tests/*.test.mjs`. Publicación web: `node scripts/build.mjs` seguido del workflow Publish MINDS. iOS: `apps/isabella-ios/project.yml` con XcodeGen, `.github/workflows/ios-native.yml` para simulador y `.github/workflows/ios-testflight.yml` para firma/distribución manual; consultar `apps/isabella-ios/TESTFLIGHT-SIN-MAC.md` antes de tocar credenciales Apple.

## Nota histórica

Theory e Isabella fueron reunidas desde `gari01234/minds-theory` con historial conservado. Las conversaciones comparten infraestructura y distinguen `conversations.app_scope` (`theory`/`isabella`); **app_scope es una separación funcional y no reemplaza RLS de propietario**. El antiguo README documentaba exclusivamente esta migración inicial y no describía el producto posterior. Esta sección conserva la genealogía sin presentarla como el estado actual.
