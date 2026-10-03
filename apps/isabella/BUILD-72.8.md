# Build 72.8 — Read-only MINDS MCP v0.1

Fecha: 3 de octubre de 2026.

## Propósito

72.6B demostró en laboratorio que un Agent puede recuperar contexto a través de herramientas MCP estrechas y que `allowed_tools` puede mantener capabilities de escritura fuera de su alcance.

72.8 convierte esa idea en una frontera real de MINDS:

**un execution externo recibe únicamente una capability temporal, ligada a su Mission Runtime execution, y cada lectura queda auditada.**

El provider no recibe Supabase, SQL, service role ni un snapshot completo por defecto.

## Capability grants

La tabla `minds_runtime_capability_grants` representa autoridad efímera del execution plane.

Cada grant queda ligado a:

- `execution_id`;
- `user_id` derivado del execution;
- SHA-256 del token;
- lista explícita de capabilities;
- expiración;
- status;
- contador de uso;
- última utilización;
- revocación;
- metadata técnica.

El token en claro no se guarda en MINDS.

La base solo admite grants cuando:

- provider = `openai_agents`;
- mode = `shadow`;
- capabilities pertenecen al conjunto read-only permitido.

Capabilities v0.1:

- `read_mission_workspace`;
- `read_relevant_artifacts`;
- `read_project_context`.

No existe capability de escritura.

Un grant puede pasar:

```
active → revoked
active → expired
```

No puede reactivarse.

La tabla no concede acceso a `anon` ni `authenticated`. RLS añade además policies explícitas `false` para ambos roles.

## MCP real

`isabella-runtime-mcp` usa autenticación propia, no JWT de cliente.

Flujo:

```
Agent Session
    ↓
Authorization: Bearer <ephemeral capability token>
    ↓
MINDS hashes token
    ↓
minds_runtime_capability_grants
    ↓
execution + user + expiry + allowed capabilities
    ↓
MCP tool
```

El endpoint es alcanzable por OpenAI pero un request sin un token activo, no expirado y ligado a un execution válido no puede recuperar contexto.

## Herramientas

### read_mission_workspace

Devuelve exclusivamente el Workspace ligado a la Mission Run del execution:

- objective;
- completion criterion;
- summary;
- hasta 80 workspace items;
- provenance class;
- source kind;
- source ref;
- timestamps.

No acepta un Workspace ID del Agent.

### read_relevant_artifacts

Devuelve metadata de `minds_artifacts` permanentes ya aceptados y ligados al Workspace.

No devuelve:

- Artifact Intake candidates;
- quarantine paths;
- signed URLs;
- file bytes.

### read_project_context

Solo puede operar sobre el proyecto ligado al Commitment del Workspace.

Devuelve identidad mínima del proyecto y claims `confirmed` acotados.

No devuelve archivos ni credenciales.

72.8 no concedió esta capability durante el piloto.

## Auditoría

Cada tool call actualiza:

- `last_used_at`;
- `use_count`.

Además registra un evento `mcp.read` en `minds_mission_runtime_events`.

El evento guarda:

- capability;
- grant ID;
- Mission Run;
- conteo de items/artifacts/claims según corresponda.

No duplica el contenido leído dentro del audit log.

## Piloto real

Se creó una Mission real no sensible dentro de la cuenta de Isabella.

El Workspace contenía cuatro hechos sobre la política de runtime:

1. Persistent Environment solo es elegible cuando el valor depende de estado material durable.
2. Dificultad, duración, número de documentos o múltiples turns no bastan para elegir Agents.
3. Todo archivo persistente externo debe atravesar Artifact Intake.
4. El execution externo sigue shadow-only y no puede escribir estado autoritativo.

El prompt enviado a OpenAI **no incluía esos cuatro hechos**.

La Agent Session recibió únicamente:

`read_mission_workspace`

mediante `allowed_tools`.

El token efímero fue generado server-side, MINDS almacenó solo su hash y la credencial se pasó en el transport MCP de esa única Session.

## Primera ejecución descartada

La primera Mission fue creada y pausada en dos operaciones separadas.

Entre ambas, el cron nativo alcanzó a reclamar un checkpoint y añadió cuatro workspace items. Aunque el MCP external execution fue read-only, esa Mission dejó de servir como evidencia de zero write-through.

La ejecución se marcó como contaminada metodológicamente y su Commitment técnico fue eliminado.

No se utilizó para la conclusión de 72.8.

## Repetición limpia

La segunda Mission se creó, pobló, inició y pausó **dentro de una única transacción**. Por tanto el runner nativo nunca pudo observarla en `queued`.

Resultado del Agent:

- exactamente un `mcp_call`;
- tool: `read_mission_workspace`;
- server: `minds_readonly`;
- status: `completed`;
- ninguna otra tool observada;
- input: 24.778 tokens;
- cached input: 15.990;
- output: 261;
- total: 25.039.

El Agent recuperó correctamente la política almacenada en el Workspace y produjo la síntesis esperada.

Al finalizar:

- Mission status: `paused`;
- Mission iteration: `0`;
- Workspace items: exactamente `4`;
- runtime execution: `succeeded / completed`;
- grant use count: `1`;
- audit events `mcp.read`: `1`;
- grant status: `revoked`;
- Agent Session: eliminada.

No hubo write-through.

## Decisión

**Read-only MINDS MCP pasa de boundary candidate a infraestructura válida de execution externo.**

Esto no significa que todos los Agents reciban MCP.

La regla es capability-scoped:

- una Mission recibe únicamente las herramientas que su execution necesita;
- las herramientas se conceden mediante un grant temporal;
- el grant se revoca al terminar;
- cada lectura queda auditada;
- una capability que no está concedida no debe descubrirse.

La arquitectura preferida para external execution queda:

```
MINDS
  ├─ Mission authority
  ├─ memory
  ├─ permissions
  ├─ provenance
  ├─ Attention Economy
  └─ capability grants
          ↓
     OpenAI Agent
          ↓
   narrow read-only MCP
```

## Lo que 72.8 no hace

- no activa Agents como runtime default;
- no habilita write MCP;
- no habilita 72.5C write-through;
- no entrega credenciales de Supabase al Agent;
- no convierte project context en contexto automático;
- no permite elegir Workspace/project IDs desde el provider;
- no expone Artifact Intake candidates;
- no cambia memoria ni permisos.

## Siguiente fase

72.7 y 72.8 ya demuestran las dos piezas que sí aportaron valor:

- estado material durable;
- recuperación mínima y auditable de contexto.

El siguiente paso es un **Decision Gate** explícito: codificar exactamente qué propiedades de una Mission permiten considerar esta infraestructura y cuáles obligan a permanecer en `native_minds`.

Ese gate deberá ser determinista, explicable y sin score opaco.
