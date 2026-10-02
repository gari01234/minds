# Build 72 — Human Surface / Conversational Abstraction v0.1

Fecha: 2 de octubre de 2026. Base: Build 71 publicado en `main` mediante `397c9e2c69cca33fb4898d28f192f9851f657c8f`.

## Objetivo

Build 72 convierte la complejidad interna de MINDS en una superficie cotidiana más legible sin simplificar la arquitectura que existe debajo. Isabella no se vuelve “más humana” fingiendo emociones, conciencia o identidad humana. La interfaz se vuelve más humana porque traduce responsabilidad, tiempo, incertidumbre, continuidad y necesidad de decisión a un lenguaje que no exige conocer la ontología del sistema.

La regla de producto queda explícita:

**cada nueva complejidad interna debería intentar producir menos complejidad externa.**

## Contrato de Human Surface

La Human Surface es una proyección de lectura, no una nueva fuente de verdad. No persiste un estado alternativo, no cambia permisos, no ejecuta acciones, no decide atención y no altera Missions, Commitments, memoria ni evidencias. Si una frase humana entra en conflicto con el estado técnico, el estado técnico gana y la frase debe corregirse.

La proyección expone cuatro dimensiones simples:

1. **Qué está pasando.**
2. **Quién tiene que actuar ahora.**
3. **Qué grado de certeza existe.**
4. **Si el usuario necesita hacer algo.**

El contrato cliente se implementa en `shared/human-surface.js`. Produce un objeto pequeño con `headline`, `detail`, `owner`, `certainty`, `action`, `tone` y una referencia técnica no autoritativa para inspección.

Ejemplos:

- `mission_run.status=running` → “Estoy trabajando en esto.”
- `mission_run.status=waiting_for_user` → “Necesito que decidas algo antes de poder seguir.”
- `mission_run.status=completed` → “He terminado este trabajo.”
- `contextual_autonomy.eligibility=eligible` → “Puedo dejar de preguntarte en este caso, si tú quieres.”
- sistema sin incidencias ni trabajo bloqueado → “Todo está funcionando con normalidad. No necesito nada de ti ahora mismo.”

## Progressive disclosure

La información técnica no desaparece. Continuidad, trabajo durable, permisos, Attention y Estado de MINDS muestran primero la frase humana y permiten abrir **Ver detalle técnico** cuando hace falta inspeccionar estados como Mission Workspace, Mission Run, checkpoint, route, provenance o evidencia de permisos.

El uso diario no exige aprender esos términos; el diagnóstico sigue pudiendo verlos.

## Superficies modificadas

### Continuidad

Los Commitment y Mission Workspaces dejan de presentarse principalmente mediante nombres de infraestructura. El usuario ve si algo sigue vivo, está pendiente, está pausado o si Isabella está trabajando sobre ello. Mission Workspace sigue disponible en el detalle técnico.

### Trabajo de Isabella

La antigua cabecera visible `Mission Workspace` pasa a `Trabajo de Isabella`. El estado durable se expresa como trabajo en curso, decisión necesaria, pausa, finalización o fallo. Checkpoint, fase, reintentos y status continúan disponibles bajo detalle técnico.

Los items operativos conservan su procedencia; la procedencia se desplaza a disclosure secundario. La Human Surface no transforma hallazgos en hechos confirmados.

### Permisos de Isabella

Shadow Agency y las condiciones de elegibilidad siguen intactas. La superficie explica primero si Isabella todavía está aprendiendo, seguirá preguntando o ya puede proponer al usuario dejar de confirmar ese caso. Las métricas —revisiones, correcciones, rechazos, días y campos modificados— permanecen bajo detalle técnico.

La autoridad no cambia: solo el usuario concede o revoca un permiso.

### Atención y avisos

Los controles dejan de exigir al usuario interpretar `interrupt`, `briefing`, `ambient` y `silent`. Las opciones visibles pasan a “avisarme en cuanto ocurra”, “guardarlo para el próximo resumen”, “dejarlo discretamente en Feed” o “no avisarme automáticamente”. La vista histórica explica primero qué decidió Isabella y conserva route/source/status bajo detalle técnico.

Build 71 sigue siendo la capa de transporte; Build 72 no cambia qué eventos merecen push.

### Estado de MINDS

La vista se abre con un resumen humano: normalidad, trabajo en curso, algo esperando una decisión o un problema que conviene revisar. El dashboard técnico existente queda detrás de **Ver estado técnico de MINDS**.

## Conversación

El system prompt de `isabella-chat` incorpora explícitamente Human Surface. La ontología privada puede seguir usándose para razonar, pero no debe filtrarse espontáneamente al usuario.

Por defecto Isabella debe traducir términos como Commitment, Mission Workspace, Mission Run, `waiting_for_user`, attention events, contextual permissions, Shadow Agency, Continuity signals, leases, checkpoints y receipts. Si el usuario pide detalle técnico, puede mostrarlos.

La regla también exige calibrar certeza: “está hecho”, “lo estoy comprobando” y “parece probable pero todavía no tengo evidencia suficiente” no son equivalentes.

## Proactividad

`isabella-mission-runner` elimina lenguaje de infraestructura de sus mensajes proactivos visibles. `isabella-routine-runner` recibe la misma regla para integrar señales diferidas en lenguaje humano. Web Push se alinea con los nuevos títulos de durable work.

No se modifica el runtime durable ni la política de Attention Economy.

## Invariantes

- Supabase y los estados existentes siguen siendo la fuente de verdad.
- Human Surface no tiene tablas propias ni migración de base de datos.
- No se crea una nueva navegación principal.
- No se concede autonomía adicional.
- No se cambia ningún umbral de Contextual Autonomy.
- No se cambia la política de Attention Economy.
- No se ocultan errores o incertidumbre detrás de una frase tranquilizadora.
- No se atribuyen emociones, conciencia o necesidades humanas a Isabella.
- El detalle técnico continúa disponible de forma explícita.

## Verificación

La build añade `tests/human-surface.test.mjs` para validar estados humanos, autoridad, incertidumbre, progressive disclosure, lenguaje de Isabella, mensajes proactivos y ausencia de una nueva superficie de navegación. El workflow de PR amplía `deno check` a todas las Edge Functions modificadas por esta build.

El cierre exige: tests Node verdes, build web verde, Deno typecheck verde, despliegue de las Edge Functions modificadas, smoke checks de funciones y workflow oficial de Pages verde después de merge.
