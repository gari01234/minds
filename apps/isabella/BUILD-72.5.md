# Build 72.5 — Agent Runtime Adapter / OpenAI Agents Spike v0.1

Fecha: 2 de octubre de 2026. Base: Build 72 publicado en main mediante `2dbf5d9c41f7aac0dea02d9e26aff088418b5a7e`.

## Motivo

Antes de continuar con Builds 73–76, MINDS debe comprobar si parte de la ejecución durable que hoy realiza `isabella-mission-runner` puede delegarse a OpenAI Agents API sin ceder memoria, autoridad, procedencia, permisos ni política de atención.

Esta build es un spike reversible. No sustituye el runtime actual ni cambia producción mientras no exista evidencia suficiente.

## Hipótesis

MINDS debe seguir siendo el control plane:

- Isabella conserva identidad y superficie humana.
- Commitments conservan el objetivo persistente.
- Mission Workspaces conservan el estado operativo y su procedencia.
- Supabase conserva la fuente de verdad.
- Contextual Autonomy y permisos conservan la autoridad.
- Attention Economy decide cuándo interrumpir.
- Delivery Layer transporta únicamente decisiones ya tomadas.

OpenAI Agents API puede actuar como execution plane temporal:

- sesiones durables;
- context compaction y recuperación gestionadas;
- sandbox;
- herramientas;
- subagentes;
- webhooks;
- Computer Use;
- MCP.

La sesión de OpenAI no se convierte en memoria autobiográfica de Isabella ni en fuente de verdad de MINDS.

## Regla central

`Mission Run` sigue siendo el objeto autoritativo de MINDS. Una Agent Session es un backend de ejecución posible para ese Run, no su sustituto conceptual.

Modelo previsto:

```
Commitment
    ↓
Mission Workspace
    ↓
Mission Run (MINDS)
    ↓
Runtime Adapter
    ├── native_minds
    └── openai_agents
             ↓
       Agent Session
             ↓
       resultados estructurados
             ↓
Mission Workspace
```

## Fase A — Adapter contract

Definir una interfaz común para cualquier runtime durable:

- `start(run, snapshot)`
- `inspect(execution)`
- `steer(execution, input)`
- `pause_or_stop(execution)`
- `collect(execution)`

El adapter nunca recibe credenciales de Supabase dentro del sandbox del agente.

El snapshot de entrada será mínimo y explícito: objetivo, criterio de cierre, resumen operativo, items relevantes y contexto de proyecto permitido.

La salida debe volver a las primitivas existentes del Workspace:

- plan
- finding
- source
- question
- decision (siempre proposed)
- note
- summary
- completed / waiting_for_user / failed

## Fase B — Shadow execution

La primera ejecución con Agents API no podrá escribir directamente en el Mission Workspace ni ejecutar acciones externas.

Se ejecutará en paralelo conceptual con el runtime actual sobre una Mission controlada. El resultado se conservará como evidencia de evaluación separada.

Compararemos, sin score opaco:

- calidad y utilidad del resultado;
- capacidad de mantener continuidad;
- recuperación después de interrupción;
- corrección de procedencia;
- frecuencia y calidad de preguntas al usuario;
- latencia;
- coste/token usage;
- estabilidad operativa;
- facilidad de observación y depuración.

No se elegirá ganador por una métrica compuesta.

## Fase C — Controlled write-through

Solo si Shadow demuestra una ventaja material, un Agent Session podrá devolver items al Workspace mediante un boundary de MINDS.

El agente no escribirá directamente en tablas. MINDS validará cada output antes de aplicar:

- ownership;
- workspace/run vigente;
- tipos admitidos;
- provenance;
- decisiones forzadas a proposed;
- límites de longitud y cantidad;
- ausencia de side effects.

La ejecución externa seguirá sin tener autoridad para Tasks, Events, Routines, memoria personal, claims confirmados, archivos o sistemas externos.

## Fase D — MCP boundary

No forma parte del primer spike funcional, pero se considera la dirección preferida para workers/subagents.

Motivo: Agents API permite que subagentes hereden MCP y credenciales/allowed tools de MCP, mientras que los subagentes no soportan function tools. Por ello, una futura arquitectura multi-agent debería exponer capacidades estrechas de MINDS mediante un MCP server controlado, no mediante acceso directo a Supabase.

Capacidades candidatas futuras:

- `read_mission_workspace`
- `read_project_context`
- `append_workspace_proposal`
- `request_user_decision`
- `propose_action`

Las operaciones con side effects seguirán pasando por la autoridad de MINDS.

## Session identity

MINDS debe conservar una correspondencia explícita entre:

- `mission_run_id`
- runtime provider
- provider session id
- provider turn id(s)
- lifecycle status
- timestamps
- usage observada

Esta relación es infraestructura operativa, no memoria del usuario.

## Webhooks

Agents API puede emitir eventos de lifecycle, incluidos sesión creada, in progress, idle, failed y action required. MINDS debería consumir estos eventos como señales de runtime, no como verdad final del trabajo.

`idle` no equivale a `completed`: el estado del turn y los resultados de tools deben verificarse antes de marcar un Mission Run como terminado.

## Computer Use

Computer Use queda fuera del primer pilot de ejecución. Su adopción futura requerirá una frontera de approvals independiente.

Un browser origin approval no equivale a aprobación de cada acción posterior. Por tanto, MINDS no debe interpretar acceso a un sitio como autorización para compras, cambios destructivos, envíos o acciones externas.

## Multi-agent

El primer pilot debe usar un solo agente principal.

Multi-agent se activará únicamente cuando exista una tarea naturalmente separable en trabajos independientes. Los subagentes son capacidad interna; nunca se convierten en identidades visibles competidoras de Isabella.

## No-go conditions

El spike se rechaza como sustituto de runtime si requiere cualquiera de estas concesiones:

- mover la memoria principal de Isabella a una Agent Session;
- duplicar permisos o autonomía fuera de MINDS;
- aceptar resultados sin validación de procedencia;
- permitir escrituras directas del agente a Supabase;
- perder trazabilidad entre Mission Run y ejecución;
- convertir subagentes en nuevas superficies de usuario;
- debilitar Attention Economy;
- depender de un estado de proveedor imposible de reconstruir o auditar suficientemente.

## Criterio de éxito

Build 72.5 no busca demostrar que Agents API es “mejor” en abstracto. Busca responder una pregunta concreta:

**¿Puede MINDS delegar ejecución durable y agentic a OpenAI conservando íntegramente su propio modelo de identidad, memoria, autoridad, procedencia y atención?**

Si la respuesta es sí, el siguiente paso será convertir `Mission Run` en un control plane multi-runtime de forma incremental.

Si la respuesta es no, el runtime nativo actual permanece como arquitectura principal y el aprendizaje del spike se conserva sin introducir dependencia.

## Roadmap

Builds 73–76 permanecen pausadas, no canceladas:

- Build 73 — Outcome Learning / Post-Action Feedback v0.1
- Build 74 — Personal Operating Model v0.1
- Build 75 — Counterfactual Isabella v0.1
- Build 76 — Expectation Engine v0.1

Build 72.5 se inserta antes de ellas porque determina hasta qué punto MINDS debe seguir construyendo infraestructura agentic propia.


## Estado de 72.5A — Runtime Adapter Contract

72.5A queda implementada como una capa aditiva. No cambia todavía el runtime primario de ninguna Mission.

El contrato compartido vive en `supabase/functions/_shared/mission-runtime.ts` y define:

- providers: `native_minds` y `openai_agents`;
- modos: `primary` y `shadow`;
- lifecycle de ejecución separado del outcome de la Mission;
- capacidades explícitas por provider;
- las cinco operaciones comunes `start / inspect / steer / pause_or_stop / collect`;
- snapshot v1 acotado y sin identidad de usuario ni credenciales;
- normalización de items, sources y provenance antes de cruzar el boundary;
- un adapter `native_minds` de compatibilidad;
- registry que exige conservar `native_minds` como fallback y rechaza providers duplicados.

El snapshot rechaza claves con forma de credencial —authorization, cookies, passwords, secrets, API/service-role keys y access/refresh tokens— y limita tamaño, profundidad y complejidad. Esto es una defensa adicional: el futuro execution plane recibe únicamente contexto explícitamente preparado por MINDS.

### Ledger persistente

La migración de producción `20261002155459_mission_runtime_adapter_v01` añade dos objetos separados de `minds_mission_runs`:

- `minds_mission_runtime_executions`: mapping entre un Mission Run y una ejecución de provider;
- `minds_mission_runtime_events`: historial de lifecycle/provider turns y eventos observables.

El mapping conserva provider, mode, lifecycle, provider session id, provider turn id, snapshot hash, result status, usage, error y metadata. La identidad `mission_run_id + provider + mode` es inmutable y única en v0.1.

El `user_id` nunca se acepta como autoridad del runtime: triggers de base de datos lo derivan del Mission Run y de la ejecución padre. Authenticated puede leer únicamente sus filas mediante RLS; no puede insertar, actualizar ni borrar. Las mutaciones quedan reservadas al service role. No se añadieron RPCs `SECURITY DEFINER`.

### Validación

Antes de aplicar la migración, el DDL completo y su contrato de seguridad se ejecutaron dentro de una transacción con rollback. Después de aplicarla, `supabase/tests/mission_runtime_adapter.sql` volvió a pasar contra producción con rollback:

`PASS: runtime ownership, immutable mapping, RLS and service-only writes`.

Los Security Advisors no reportan findings nuevos sobre las tablas 72.5A. El único finding de performance nuevo es que `minds_mission_runtime_run_idx` todavía no ha sido usado, lo esperado inmediatamente después de crear una tabla cuyo runtime todavía no está conectado.

El runtime de producción permanece intacto: `isabella-mission-runner` sigue reclamando `minds_mission_runs`, usando Responses API y aplicando cada checkpoint mediante `minds_apply_mission_step`. No importa el nuevo adapter y no contiene selección de `openai_agents`.

72.5B será el primer punto en el que una ejecución `openai_agents + shadow` pueda existir. Hasta entonces, el ledger está preparado pero no dirige ninguna Mission.
