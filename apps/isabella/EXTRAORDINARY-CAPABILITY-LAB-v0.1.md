# Build 72.6 — Extraordinary Capability Lab v0.1

Fecha: 2 de octubre de 2026.

## Pregunta

Después de Build 72.5B y 72.5B-EVAL, MINDS ya no necesita responder si Managed Agents puede razonar o mantener continuidad. Ambas capacidades quedaron demostradas, y la continuidad reconstruida desde Mission Workspace fue suficiente en los casos probados.

La pregunta nueva es más estrecha:

**¿Qué capacidades extraordinarias merece la pena alquilar a OpenAI sin entregar memoria, identidad, autoridad, procedencia o atención de Isabella?**

## Frontera arquitectónica

MINDS sigue siendo el control plane:

- Isabella conserva identidad y Human Surface.
- Commitments conservan objetivos.
- Mission Workspace conserva memoria de trabajo portable.
- Supabase conserva source of truth.
- Permissions / Contextual Autonomy conservan autoridad.
- Attention Economy conserva la política de interrupción.
- MINDS normaliza y valida cualquier resultado antes de aceptarlo.

OpenAI puede aportar execution capabilities temporales:

- environment computacional;
- archivos y artefactos de trabajo;
- tools/MCP;
- Computer Use;
- subagentes.

Ninguna capability alquilada puede convertirse silenciosamente en memoria, permiso o verdad.

## Regla experimental

Cada experimento debe probar **una capacidad diferencial concreta**.

No cuentan como justificación:

- dificultad genérica;
- varios documentos;
- varios turns;
- una tarea larga;
- necesidad de recordar contexto;
- una preferencia por modelos más grandes.

72.5B-EVAL ya demostró que esas propiedades por sí solas no justifican Agents.

No habrá score global. Para cada capability se registrará:

- qué puede hacer que native no puede hacer o no puede hacer eficientemente;
- calidad del resultado;
- continuidad del estado de ejecución;
- procedencia;
- seguridad / approvals;
- latencia;
- token volume y costes observables cuando estén disponibles;
- carga de infraestructura para MINDS;
- facilidad de recuperación y auditoría.

## 72.6A — Persistent Environment & Artifact v0.1

### Hipótesis

Un OpenAI-hosted environment puede aportar valor cuando el estado importante no es solo cognitivo sino **material**: archivos intermedios, scripts, transformaciones, directorios o artefactos que deben sobrevivir entre turns.

### Caso de prueba

Mission sintética de dos o tres episodios:

1. recibir un paquete de archivos de prueba;
2. producir un artefacto derivado;
3. terminar el turn;
4. volver posteriormente a la misma Agent Session;
5. modificar el artefacto existente a partir de nueva evidencia;
6. devolver a MINDS un manifest estructurado del trabajo producido.

Native no recibirá un sandbox persistente artificial para “igualar” la prueba. Su comparación será la arquitectura real de MINDS: reconstruir estado desde Workspace + archivos explícitamente guardados por MINDS.

### Boundary

- `environment.type = openai_hosted`;
- sin Computer Use;
- sin MCP;
- sin network access salvo que el experimento lo requiera explícitamente;
- ningún archivo del usuario real;
- dataset sintético;
- ningún artifact se convierte automáticamente en MINDS Artifact;
- MINDS valida tipo, tamaño, nombre, hash y provenance antes de importar.

### Señal de valor

72.6A solo justifica una ruta Agents si la persistencia del environment reduce materialmente la reconstrucción, evita pérdida de estado operativo o hace posible una clase de trabajo que native no puede mantener de forma razonable.

Si el mismo resultado se obtiene guardando artefactos explícitos en MINDS con menor complejidad, native sigue siendo preferible.

## 72.6B — Durable MCP Boundary v0.1

### Hipótesis

Agents puede aportar valor cuando una Mission necesita usar repetidamente herramientas durante una sesión durable, siempre que MINDS conserve la autoridad de cada capability.

### Arquitectura objetivo

```
Agent Session
    ↓
MINDS MCP
    ├─ read_mission_workspace
    ├─ read_project_context
    ├─ append_workspace_proposal
    └─ request_user_decision
```

El MCP no expondrá tablas Supabase ni credenciales.

La primera versión será **read-only**:

- `read_mission_workspace`
- `read_project_context`

Solo después de validar el boundary podría existir una operación que produzca propuestas. Nunca write-through directo.

### Pregunta de evaluación

¿Una sesión durable con acceso MCP estrecho puede realizar trabajo multi-step con menos reconstrucción y mejor trazabilidad que una secuencia de tool calls administrada completamente por native MINDS?

### No-go

- acceso SQL;
- service role dentro del sandbox;
- secrets en agent definitions;
- tool wildcard;
- escritura directa;
- permisos implícitos heredados del provider.

## 72.6C — Multi-Agent Parallelism v0.1

### Hipótesis

Los subagentes solo tienen sentido cuando la Mission contiene trabajos **independientes y paralelizables**.

Caso sintético candidato:

- cuatro documentos independientes;
- cada documento requiere una revisión distinta;
- un coordinador debe integrar hallazgos y contradicciones.

Comparar:

1. un solo native runtime;
2. un solo Managed Agent sin delegación;
3. Managed Agent con subagentes paralelos.

### Medidas

- wall-clock;
- cobertura de evidencia;
- contradicciones detectadas;
- duplicación de trabajo;
- coste/token volume;
- pérdida de procedencia;
- estabilidad de síntesis.

No adoptar multi-agent si únicamente aumenta actividad interna sin reducir tiempo o aumentar cobertura de forma material.

Los subagentes nunca se convierten en identidades visibles. Para el usuario todo sigue siendo Isabella.

## 72.6D — Computer Use / Browser v0.1

No se ejecutará antes de 72.6A–C.

Computer Use amplía drásticamente el action surface. Un navegador alojado puede interactuar con interfaces web, pero el acceso a un sitio no equivale a autoridad para realizar cualquier acción dentro de él.

Antes del primer benchmark se requiere un approval model específico para browser actions:

- lectura / navegación;
- descarga;
- formulario reversible;
- envío;
- compra;
- cambio destructivo;
- autenticación.

La primera prueba será read-only en una web de laboratorio o fixture controlado.

Computer Use nunca heredará automáticamente Contextual Autonomy de otras tools.

## Orden

```
72.6A  Persistent Environment / Artifacts
   ↓
72.6B  Read-only MINDS MCP
   ↓
72.6C  Multi-agent parallelism
   ↓
72.6D  Computer Use, tras diseñar approvals
```

Cada fase puede detener la investigación si no demuestra una ventaja concreta.

## Regla de adopción

Una capability pasa de laboratorio a candidato de producto únicamente si se cumplen simultáneamente:

1. aporta una capacidad material que native no ofrece de forma equivalente;
2. MINDS puede mantener source of truth y provenance;
3. la autoridad permanece en MINDS;
4. la ejecución es observable y recuperable;
5. no exige duplicar memoria o permisos;
6. su coste/latencia son proporcionales al beneficio;
7. existe una regla explicable de routing.

No se adopta una capability solo porque sea tecnológicamente posible.

## Relación con 72.5C

72.5C Controlled Write-through permanece pausado.

Primero debemos saber **qué execution capabilities merecen existir**. Solo después tiene sentido decidir qué resultados de esas capabilities pueden proponer cambios al Mission Workspace.

## Relación con Self-Evaluation

La autoevaluación de Isabella se mantiene como línea distinta. Este laboratorio genera evidencia sobre runtimes y capabilities; una futura Self-Reflection / Evolution Layer podrá usar evidencia operacional para formular propuestas de mejora, pero no podrá cambiar por sí sola routing, prompts, permisos o código.

La cadena prevista será:

```
observación
→ evidencia
→ evaluación
→ propuesta de mejora
→ revisión / aceptación
→ cambio versionado
```

Esto permite que Isabella participe en su evolución sin convertirse en autoridad sobre su propia arquitectura.
