# Build 72.7 — Capability Integration Pilot v0.1

Fecha: 3 de octubre de 2026.

## Propósito

72.6 demostró que Persistent Environment aporta una capacidad diferencial real: estado material —archivos, scripts y artefactos intermedios— que sobrevive entre turns. 72.6E añadió Artifact Intake para impedir que un output externo se convierta silenciosamente en un artefacto aceptado.

72.7 integra por primera vez ambas piezas en una Mission real de la cuenta de Isabella, pero deliberadamente no sensible.

La pregunta es:

**¿puede una Mission real usar un environment externo, producir un archivo útil y devolverlo a MINDS sin saltarse autoridad, provenance ni revisión humana?**

## Mission real

Se creó el Commitment:

`72.7 · Capability Integration Pilot`

El contenido se limita a la propia arquitectura de MINDS ya documentada. No incluye memoria personal, proyectos de arquitectura, Work, Bernried, Schwarz, calendario, contactos ni archivos privados.

La Mission fue pausada antes de ejecutar el runtime externo para impedir que el Mission Runner autoritativo la reclamase.

El execution externo usa:

- provider: `openai_agents`;
- mode: `shadow`;
- environment: `openai_hosted`;
- network: disabled;
- MCP: none;
- multi-agent: disabled;
- write-through: false.

## Dos episodios sobre el mismo environment

### Episodio 1

El environment recibió únicamente dos fuentes no sensibles:

- evidencia consolidada de Build 72.6;
- contrato de Artifact Intake v0.1.

El Agent creó:

- `/workspace/work/pilot-plan.md`;
- `/workspace/outputs/episode1-checkpoint.md`.

El plan de trabajo quedó dentro del filesystem persistente y no se reinyectó en el segundo prompt.

Uso observado:

- input: 66.377 tokens;
- cached input: 42.847;
- output: 2.795;
- total: 69.172.

### Episodio 2

MINDS añadió una única nueva fuente:

`/workspace/input/integration-rule.md`

El Agent recibió la orden explícita de reutilizar `/workspace/work/pilot-plan.md`, no reconstruirlo desde cero, y producir:

`/workspace/outputs/isabella-capability-pilot.md`

Uso observado:

- input: 55.685 tokens;
- cached input: 50.122;
- output: 1.749;
- total: 57.434.

La Session y el filesystem fueron los mismos en ambos episodios.

## Artifact Intake real

MINDS descargó el Markdown final desde Session Artifacts y verificó sus bytes antes de registrarlo.

Resultado:

- title: `Informe · Capability Integration Pilot 72.7`;
- kind: `markdown`;
- size: **5.224 bytes**;
- SHA-256: `472fc56ad39045591b9419b3a5507d1d8efd4ba3c942f66c43117249ab79d72c`;
- status: **pending**.

El archivo fue copiado al bucket privado `minds-artifact-intake`.

No se creó ningún `minds_artifacts` permanente.

Después de finalizar, la Agent Session fue eliminada y el runner one-shot fue retirado como `410 Gone + verify_jwt=true`.

## Zero write-through verificado

Después del runtime externo:

- Mission status: `paused`;
- Mission iteration: `0`;
- Mission result summary: vacío;
- Workspace items: `0`;
- Runtime execution: `succeeded / completed`;
- Artifact Intake: `pending`;
- accepted artifact: `null`.

Por tanto, el provider pudo producir trabajo material sin modificar el Mission Workspace autoritativo.

## Revisión humana integrada

El panel existente **Más → Artefactos** incorpora ahora dos estratos:

### Por revisar

Un candidate muestra:

- título;
- formato;
- tamaño;
- fecha;
- SHA-256 bajo detalle técnico;
- `Vista previa`;
- `Conservar`;
- `Rechazar`.

La vista previa se obtiene mediante una URL firmada de cuarentena de diez minutos generada server-side para el propietario autenticado.

### Conservar

`Conservar` ejecuta primero el review RPC bajo autoridad del usuario:

`pending → accepted`

Después llama a `isabella-artifact-intake`, que vuelve a descargar el objeto de cuarentena y verifica:

- ownership;
- status accepted;
- expiry;
- size;
- SHA-256;
- MIME;
- Mission Runtime execution;
- Mission Workspace de destino.

Solo entonces:

1. copia bytes a `minds-artifacts`;
2. crea el `minds_artifacts` permanente con `source_kind='mission_runtime'`;
3. conserva provenance del intake, execution, Mission y provider;
4. marca el intake `promoted`;
5. elimina la copia de cuarentena;
6. registra `artifact.promoted` en el runtime ledger.

Si la promoción falla después de aceptar, el candidate permanece `accepted` y aparece `Terminar de conservar` para reintentar de forma explícita.

### Rechazar

`Rechazar` mueve el candidate a `rejected`.

No crea artefacto permanente y no altera Mission Workspace ni memoria.

## Frontera

72.7 establece por primera vez el recorrido:

```
real Mission
    ↓
external persistent environment
    ↓
provider artifact
    ↓
byte verification
    ↓
Artifact Intake / pending
    ↓
human review
    ├─ reject
    └─ accept
          ↓
       verify again
          ↓
       permanent MINDS artifact
```

La capability externa produce trabajo.

MINDS decide cómo entra.

El usuario decide si permanece.

## Decisión

72.7 confirma que Persistent Environment puede integrarse sin entregar a OpenAI el control plane de Isabella.

Esto **no** convierte `openai_agents` en runtime default.

La capability solo es candidata para Missions cuyo valor depende de estado material durable. Dificultad, duración, múltiples documentos o múltiples turns no bastan como razón.

La siguiente fase es 72.8: Read-only MINDS MCP sobre contexto real, mínimo y auditable.
