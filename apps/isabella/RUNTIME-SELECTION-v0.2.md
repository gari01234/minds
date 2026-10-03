# MINDS Runtime Selection Policy v0.2

Fecha: 3 de octubre de 2026.

Derivada de Build 72.5A–B, 72.5B-EVAL, 72.6, 72.6E, 72.7 y 72.8.

## Decisión

`native_minds` permanece como runtime primario de todas las Missions.

OpenAI Agents no se convierte en un segundo runtime primario.

La infraestructura externa se adopta únicamente como **execution lane auxiliar** para una clase estrecha de Missions:

> Missions cuyo trabajo útil depende de reutilizar estado material durable entre checkpoints.

Estado material significa:

- archivos de trabajo;
- scripts creados durante la Mission;
- transformaciones intermedias;
- artefactos intermedios.

La propiedad decisiva no es que esos elementos existan una vez, sino que deban **sobrevivir y reutilizarse entre checkpoints**.

## Regla de routing

El gate no usa score.

Para permitir el lane externo deben cumplirse simultáneamente todas estas condiciones:

1. la Mission requiere estado material durable;
2. ese estado debe reutilizarse entre checkpoints;
3. existe al menos una razón material explícita: `files`, `scripts`, `transformations` o `intermediate_artifacts`;
4. el execution no contiene datos sensibles dentro del provider environment;
5. network access del environment no es necesario;
6. Computer Use no es necesario;
7. multi-agent no es necesario;
8. no hay side effects externos;
9. no hay write-through hacia Mission Workspace;
10. no se requieren secrets dentro del provider environment;
11. cualquier lectura desde MINDS pertenece al conjunto MCP ya validado para routing;
12. si un output debe sobrevivir fuera del environment, su tipo es compatible con Artifact Intake.

Si cualquiera falla:

```
Mission
  ↓
native_minds only
```

Si todas pasan:

```
Mission
  ↓
native_minds / primary
  ↓
bounded external material execution
     provider: openai_agents
     mode: shadow
     authority: none
```

La palabra `shadow` aquí describe autoridad, no irrelevancia. El execution puede producir trabajo material real, pero no posee el lifecycle de la Mission ni puede convertir su resultado en verdad autoritativa.

## Lo que NO es una razón de routing

No se usa infraestructura externa únicamente porque una Mission sea:

- difícil;
- larga;
- multi-turn;
- multi-documento;
- de investigación;
- de síntesis;
- recurrente;
- dependiente de recordar una conclusión anterior;
- bloqueada por una pregunta al usuario.

72.5B-EVAL demostró que Mission Workspace ya resuelve suficientemente esas propiedades para el envelope probado.

## MCP no es trigger

Build 72.8 valida Read-only MINDS MCP como frontera de contexto.

Eso no significa que una Mission con necesidad de contexto deba ir a Agents.

MCP se usa únicamente **después** de que una necesidad material haya justificado el lane externo.

En v0.2, el único read capability aprobado para routing automático es:

- `read_mission_workspace`.

`read_relevant_artifacts` y `read_project_context` existen dentro del MCP boundary, pero no forman parte del gate automático hasta una validación real separada.

## Artifact Intake

Si el execution externo produce un archivo que debe persistir fuera del provider environment, Artifact Intake es obligatorio.

Tipos persistentes actualmente soportados:

- PNG / JPEG / WebP mediante kind `image`;
- DOCX;
- PDF;
- Markdown.

Archivos como scripts, CSV o JSON pueden vivir dentro del environment como estado operacional temporal. No se convierten automáticamente en MINDS artifacts.

## Datos sensibles

72.7 y 72.8 se validaron con Missions reales pero no sensibles.

Por tanto, v0.2 falla cerrado ante `contains_sensitive_data=true`.

Esto no es una afirmación de que Managed Agents no pueda procesar datos privados. Significa que esa clase de uso no ha sido validada como execution pattern de MINDS y no se concede por extrapolación.

## Capabilities no adoptadas

El gate bloquea:

- provider network access;
- Computer Use;
- multi-agent;
- side effects externos;
- write-through;
- secrets dentro del provider environment.

Cada una necesitaría evidencia y una frontera de autoridad separadas.

## Por qué el runtime primario sigue siendo native

La arquitectura final después de 72.7–72.9 es:

```
MINDS / native_minds
  ├─ Mission lifecycle
  ├─ Mission Workspace
  ├─ memory
  ├─ permissions
  ├─ provenance
  ├─ Attention Economy
  ├─ capability routing gate
  └─ external execution request
          ↓
     openai_agents / shadow
          ├─ persistent material environment
          └─ optional narrow read-only MCP
          ↓
     provider artifact
          ↓
     Artifact Intake
          ↓
     human review
```

La infraestructura externa amplía capacidad material.

No sustituye el cerebro operativo de Isabella.

## Contrato ejecutable

La política vive en:

`supabase/functions/_shared/mission-runtime-routing.ts`

El manifest de entrada es `mission_execution_requirements_v1`.

La salida es `mission_execution_decision_v1`.

El gate normaliza el manifest, ignora campos desconocidos y nunca crea autoridad a partir de texto libre.

Resultado posible:

- `native_only`;
- `native_plus_external_material`.

No existe resultado `openai_agents_primary`.

## Estado

Con v0.2, el Decision Gate queda resuelto.

Persistent Environment y Read-only MCP dejan de ser experimentos aislados y pasan a una arquitectura de uso limitada y explícita.

No se activa una expansión adicional del execution surface antes de Build 73.
