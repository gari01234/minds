# Build 79.2 — General Capability Acceptance Suite v0.1

Fecha: 4 de octubre de 2026.

## Propósito

Build 79.2 prueba y endurece la tesis central de Build 79:

> Isabella no debe aprender formatos uno por uno. Un único general execution runtime debe poder generar, editar y transformar material heterogéneo.

No se añaden herramientas `make_excel`, `make_powerpoint`, `edit_word` ni equivalentes.

Todos los casos pasan por:

```
Isabella
  ↓
execute_artifact_task
  ↓
general_execution
  ↓
OpenAI Responses + Code Interpreter
```

## Acceptance matrix

La suite canónica vive en:

`tests/fixtures/general-capability-acceptance-v01.json`

y cubre cinco familias distintas:

1. spreadsheet generation → XLSX;
2. presentation generation → PPTX;
3. edit existing deliverable → artifact input → DOCX;
4. transform project source → Work file input → PDF;
5. background survival → el trabajo puede terminar después de cerrar el chat.

El objetivo de la suite no es comprobar que una función específica sabe fabricar cada formato, sino demostrar que la misma abstracción puede cubrir todos los casos.

## Generic file-input bridge

Build 79 ya tenía el container general para producir archivos desde cero. La infraestructura server-side de inputs existía parcialmente, pero el bridge desde Isabella aún no pasaba las referencias de archivo al runtime. 79.2 cierra esa cadena de extremo a extremo.

79.2 añade un bridge genérico con dos fuentes:

- `artifact`: cualquier artifact propio de Gari en `minds_artifacts`;
- `work_file`: cualquier archivo propio de Work en `minds_work_files`.

`execute_artifact_task.input_files` recibe únicamente referencias `{source,id}`.

El runtime:

1. valida ownership;
2. descarga el archivo desde el bucket privado correspondiente;
3. valida extensión y tamaño;
4. lo incorpora como `input_file` a la misma petición Responses;
5. Code Interpreter lo recibe dentro de su container;
6. el modelo puede editarlo, reutilizarlo o transformarlo;
7. los outputs vuelven por el mismo artifact bridge de Build 79;
8. cada output transformado conserva en metadata `derived_from` las referencias de los inputs que lo originaron.

Los archivos de entrada con `source=user` dentro del container se excluyen de los outputs persistidos: MINDS solo conserva archivos generados por la ejecución, no reimporta silenciosamente los originales como si fueran resultados nuevos.

No existe routing por extensión hacia motores distintos.

## Source resolution

Isabella incorpora `search_generated_artifacts` para localizar archivos producidos anteriormente.

Esto permite interacciones naturales como:

> “Cambia el título del Word que hiciste antes.”

Isabella puede localizar el artifact, pasar su ID a `execute_artifact_task` y hacer la modificación dentro del general runtime.

Para archivos del Desktop del proyecto se reutiliza `search_work`; los IDs de `minds_work_files` pueden entrar directamente como `source=work_file`.

## Bounds

v0.1 limita:

- máximo 6 input files;
- máximo 12 MiB por input;
- máximo 24 MiB acumulados por ejecución.

Los inputs permanecen privados y se resuelven server-side. El modelo nunca recibe acceso directo a Supabase ni credenciales.

## Editing / transformation contract

Cuando existen input files, el worker recibe instrucciones explícitas para:

- trabajar desde los archivos proporcionados;
- editar o transformar el archivo real cuando esa sea la intención;
- conservar contenido, fórmulas, estructura y formato que Gari no pidió modificar siempre que sea razonable;
- producir un archivo final real, no solo instrucciones para editarlo.

## Background

79.2 no crea otro mecanismo background.

Reutiliza exactamente la misma cadena durable de Build 79:

```
background Responses
→ minds_capability_runs
→ capability runner cron
→ reconciliation
→ artifact persistence
→ original chat / Work Thread
```

Cerrar el navegador no forma parte del estado de ejecución.

## Real baseline

El primer acceptance test real anterior a esta suite fue la Teilnehmerliste de Bernried.

Producción registró:

- 1 general capability run completado;
- PDF;
- DOCX;
- PNG de preview;
- sin formato solicitado explícitamente por Gari.

79.2 no fabrica ejecuciones sintéticas de Excel, PowerPoint, edición o transformación en producción para aparentar cobertura. La suite CI verifica contratos, routing, ownership, binary handoff, provenance y background durability. Los tests E2E de producto siguen correspondiendo a peticiones naturales bajo la sesión autenticada de Gari.

## Invariantes

- un solo general execution runtime;
- ningún handler por formato;
- files in → files out;
- source file ≠ project truth;
- generated deliverable ≠ project truth;
- ownership obligatorio para cada input;
- no browser, email, MCP ni side effects externos dentro de general execution;
- background execution no depende de que la PWA siga abierta.


## Runtime version

- General execution runtime: `capability-runtime-v0.2.1`.
- PWA marker: `Build 2026.10.04.79.2`.
- Service Worker source: `isabella-shell-v92`.

## Criterio de cierre

79.2 pasa si la misma capability `execute_artifact_task → general_execution` puede representar los cinco casos de la matriz y si edición/transformación entregan el binario fuente original al container con ownership comprobado.

79.2 falla si para resolver cualquiera de esos casos aparece una nueva herramienta específica del tipo `make_excel`, `make_powerpoint`, `edit_word` o `transform_pdf`.
