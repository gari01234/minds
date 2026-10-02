# Artifact Intake v0.1

Build 72.6E · 2 de octubre de 2026.

## Propósito

72.6A demostró que un OpenAI-hosted environment puede conservar archivos, scripts y estado material entre turns. Esa capability solo mejora a Isabella si los outputs externos entran en MINDS mediante una frontera que preserve autoridad y provenance.

Artifact Intake v0.1 introduce esa frontera.

La regla central es:

```
provider artifact
    ≠
accepted MINDS artifact
    ≠
memory
    ≠
project truth
```

## Flujo

```
OpenAI Agent / external runtime
        ↓
/workspace/outputs/...
        ↓
server verifies bytes
        ↓
quarantine storage
        ↓
minds_artifact_intake
        ↓
pending
   ┌────┴────┐
 reject    accept
   │          │
 final        ↓
         internal promotion
              ↓
         minds_artifacts
```

Un candidate no se añade al Mission Workspace, no se convierte en mensaje, no entra en memoria y no dispara Attention Economy.

## Quarantine

Se crea el bucket privado `minds-artifact-intake`.

No existe policy de Storage para `anon` ni `authenticated`. El cliente no puede escribir, leer ni borrar objetos de cuarentena directamente.

El path debe quedar ligado a:

```
user_id / execution_id / ...
```

y el trigger deriva `user_id` y provider desde `minds_mission_runtime_executions`.

Un runtime externo no puede elegir a qué usuario pertenece su output.

## Formatos v0.1

Artifact Intake solo admite tipos que la biblioteca permanente de MINDS ya entiende:

- PNG / JPEG / WebP;
- DOCX;
- PDF;
- Markdown.

Máximo: 20 MB.

Los scripts, CSV, JSON y otros archivos de trabajo pueden permanecer dentro del execution environment como estado intermedio, pero no se importan automáticamente.

Esto es deliberado: 72.6A demostró que el environment es útil precisamente para conservar ese material temporal sin convertirlo en memoria permanente.

## Identidad verificable

Cada candidate registra:

- execution;
- provider;
- provider artifact id;
- provider path;
- kind;
- MIME;
- size;
- SHA-256;
- quarantine path;
- metadata;
- expiry.

La identidad material —provider path, size, MIME, hash y quarantine path— queda inmutable después del registro.

La futura capa que descargue bytes desde OpenAI deberá recalcular SHA-256 antes de registrar el candidate y volver a verificarlo antes de promoción.

## Estado

Estados permitidos:

```
pending
  ├─ accepted
  │     ├─ promoted
  │     ├─ failed
  │     └─ expired
  ├─ rejected
  └─ expired
```

`promoted` exige un `accepted_artifact_id` real.

No existe transición desde `pending` directamente a `promoted`.

## Review authority

El usuario autenticado puede ver únicamente sus candidates mediante RLS.

El review RPC `minds_review_artifact_intake` usa `SECURITY INVOKER`, no privilegios elevados.

La tabla concede al rol `authenticated` UPDATE únicamente sobre:

- `status`;
- `review_note`.

Las columnas de identidad material no son actualizables desde el cliente.

El trigger sigue siendo la autoridad sobre las transiciones.

## Relación con minds_artifacts

`minds_artifacts` sigue representando artefactos permanentes aceptados.

Artifact Intake no reemplaza esa tabla.

La promoción futura debe:

1. comprobar que el candidate está `accepted`;
2. recuperar los bytes de cuarentena;
3. verificar hash, tamaño y MIME;
4. copiar a `minds-artifacts`;
5. insertar el registro permanente con `source_kind='mission_runtime'`;
6. guardar el vínculo de provenance con `artifact_intake_id` y `execution_id`;
7. marcar el intake como `promoted`;
8. eliminar el objeto de cuarentena cuando la operación quede confirmada.

v0.1 establece el contrato y la autoridad, pero **no activa todavía promoción automática**.

## Relación con Persistent Environment

Persistent Environment queda como capability candidate, no como runtime default.

Artifact Intake hace posible probar posteriormente una Mission no sensible donde un environment externo produzca un documento real sin saltarse las fronteras de MINDS.

La secuencia futura será:

```
Mission
  ↓
runtime chosen for a concrete capability
  ↓
provider artifact
  ↓
Artifact Intake
  ↓
human review
  ↓
optional promotion
```

## Lo que v0.1 no hace

- no cambia `native_minds` como runtime default;
- no habilita 72.5C write-through;
- no importa archivos reales del usuario hacia OpenAI;
- no promociona automáticamente outputs externos;
- no añade candidates al Workspace;
- no convierte candidates en memoria;
- no concede a Agents acceso a Supabase;
- no crea una UI nueva.

## Validación

La migración se probó primero dentro de una transacción con rollback y después contra producción con otro test rollback.

Se verificó:

- ownership derivado del Mission Runtime;
- provider ligado al execution;
- quarantine path ligado a user + execution;
- SHA-256 obligatorio;
- máximo de 20 MB;
- no Storage policies de cliente sobre cuarentena;
- review real bajo rol `authenticated`;
- `SECURITY INVOKER`;
- solo `status` y `review_note` actualizables por authenticated;
- promoción sin `accepted_artifact_id` rechazada;
- promoción correcta después de crear un `minds_artifacts` real dentro del test;
- path de cuarentena incorrecto rechazado.

Supabase Security Advisor no reporta findings nuevos vinculados a Artifact Intake después del hardening. El índice de la FK `accepted_artifact_id` se añadió; los avisos posteriores de “unused index” son esperables mientras la tabla no tenga tráfico de producción.

## Decisión

Artifact Intake v0.1 **sí se incorpora a MINDS** porque mejora la arquitectura sin ampliar silenciosamente la autoridad de Isabella.

Su valor no está en hacer más cosas automáticamente.

Su valor está en permitir que Isabella use execution capabilities más potentes manteniendo la distinción entre:

```
trabajo producido
→ trabajo propuesto
→ trabajo aceptado
```

Ésta será la frontera obligatoria para cualquier artifact producido por un runtime externo.
