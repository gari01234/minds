# Build 72.9 — Runtime Decision Gate v0.1

Fecha: 3 de octubre de 2026.

## Pregunta

72.7 demostró una integración real de Persistent Environment con Artifact Intake.

72.8 demostró una frontera MCP real, temporal, mínima y auditable.

La pregunta pendiente era:

**¿para qué clase exacta de Missions puede Isabella utilizar esta infraestructura?**

## Resultado conceptual

La respuesta no es “Missions complejas”.

Tampoco “Missions largas”.

La clase queda definida por una propiedad operacional concreta:

> **Missions donde el trabajo útil requiere conservar y reutilizar estado material entre checkpoints.**

El estado material puede consistir en archivos, scripts, transformaciones o artefactos intermedios.

Un archivo producido una sola vez no basta. Debe existir necesidad real de continuidad material.

## Arquitectura adoptada

El Decision Gate no promueve `openai_agents` a runtime primario.

`native_minds` conserva:

- Mission lifecycle;
- Workspace;
- memoria;
- permisos;
- provenance;
- Attention Economy;
- decisión de routing.

Cuando el gate permite infraestructura externa, el patrón es:

```
native_minds / primary
      ↓
external material lane
      ↓
openai_agents / shadow
```

El execution externo puede realizar trabajo real, pero carece de autoridad sobre el estado de MINDS.

## Gate determinista

Se implementa:

`supabase/functions/_shared/mission-runtime-routing.ts`

Entrada:

`mission_execution_requirements_v1`

Salida:

`mission_execution_decision_v1`

No existe score agregado.

El lane externo solo se permite cuando todas las condiciones de seguridad y capability están satisfechas.

## Condiciones positivas

Son obligatorias:

- `durable_material_state=true`;
- `cross_checkpoint_material_reuse=true`;
- al menos un material reason explícito.

Material reasons admitidos:

- `files`;
- `scripts`;
- `transformations`;
- `intermediate_artifacts`.

## Condiciones que fuerzan native_only

Cualquiera de estas propiedades bloquea el lane externo en v0.1:

- datos sensibles;
- network access del provider environment;
- Computer Use;
- multi-agent;
- external side effects;
- Mission Workspace write-through;
- secrets dentro del provider environment;
- MCP reads no validados para routing;
- persistent artifacts sin un tipo admitido por Artifact Intake.

## Read-only MCP

MCP queda clasificado como **boundary**, no como trigger.

Una Mission no sale de native simplemente porque necesite contexto.

Actualmente el único MCP read aprobado automáticamente por el gate es:

`read_mission_workspace`

porque es el que 72.8 validó end-to-end sobre una Mission real.

Los otros reads implementados continúan disponibles para experimentación explícita, pero no para routing automático.

## Artifact Intake

Si un output externo debe persistir, el gate marca `artifact_intake_required=true`.

No existe promoción directa.

La cadena permanece:

```
provider output
→ quarantine
→ pending
→ human review
→ optional promotion
```

## Casos que permanecen native

El test suite verifica explícitamente que no bastan:

- dificultad;
- duración;
- muchos documentos;
- muchos turns;
- read-only MCP por sí solo.

También verifica fail-closed para las capabilities no adoptadas.

## Significado para Isabella

Isabella puede usar infraestructura externa únicamente cuando ésta funciona como una herramienta material específica.

No se crea una personalidad distinta, otro agente visible ni un “modo Agents”.

Desde la superficie sigue siendo Isabella.

Internamente:

```
objetivo del usuario
→ MINDS determina requisitos
→ gate determinista
→ native only
   o
→ native + material execution lane
```

## Decisión

**ADOPTADO con alcance estrecho.**

Se adopta:

- Persistent Environment como capability material auxiliar;
- `read_mission_workspace` como frontera MCP opcional para ese lane;
- Artifact Intake como frontera obligatoria para outputs persistentes.

No se adopta:

- Agents como runtime primario;
- multi-agent;
- Computer Use;
- provider network access;
- write-through;
- side effects;
- secrets;
- routing de datos sensibles.

Con esto, la línea 72.5–72.9 queda cerrada.

El siguiente build vuelve al roadmap principal:

**Build 73 — Outcome Learning / Post-Action Feedback v0.1.**
