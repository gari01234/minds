# Isabella Ambient Presence Protocol v0.1

Build 79 separa presence de execution.

La fuente de verdad inicial es `minds_capability_runs`.

## Estados

- `queued` → preparing
- `in_progress` → working
- `completed` → finished
- `failed` → error
- `cancelled` → idle/history

## Human Surface

La presencia debe responder únicamente:

1. ¿Está Isabella haciendo algo?
2. ¿Qué trabajo es?
3. ¿Terminó o necesita revisión?
4. ¿Hace falta intervenir?

No muestra provider, container, run ids ni ontología interna salvo diagnóstico explícito.

## Comportamiento

- idle: invisible;
- preparing/working: presencia compacta;
- finished: aparece temporalmente y el resultado queda además en la conversación de origen;
- error: visible hasta que Gari la vea o el estado deje de ser relevante;
- interacción mínima: expandir, abrir artifacts, cancelar un run activo.

## Desktop futuro

Una shell nativa podrá consumir el mismo contrato y mantener una ventana always-on-top sin robar focus, equivalente en función —no identidad visual— al patrón observado en Coucou.

La shell nativa no será source of truth y no contendrá un segundo agente.
