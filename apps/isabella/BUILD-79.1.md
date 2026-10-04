# Build 79.1 — Artifact / Execution Human Surface polish

Fecha: 4 de octubre de 2026.

Build 79.1 no añade nuevas capabilities. Corrige la presentación de los resultados que Build 79 ya sabe producir.

## Problema observado

El primer acceptance test real de la Teilnehmerliste pasó materialmente: Isabella produjo PDF + DOCX sin que Gari pidiera formatos.

La Human Surface todavía filtraba detalles internos:

- rutas `sandbox:/mnt/data/...` en la prosa;
- enlaces Markdown técnicos que duplicaban las tarjetas de archivo;
- PNGs auxiliares del container presentados como si fueran entregables equivalentes a PDF/DOCX.

Eso hacía visible la infraestructura en vez del resultado.

## Contrato

Cuando existen artifacts materiales:

- la prosa no muestra rutas internas ni enlaces sandbox;
- MINDS presenta los archivos mediante sus tarjetas reales;
- si existe al menos un artifact no-image, los artifacts image del mismo resultado se consideran preview visual;
- el preview puede mostrarse inline, pero no se etiqueta como un tercer entregable principal;
- la misma regla aplica al chat principal, Project Threads y Ambient Presence.

Isabella recibe además una instrucción explícita para no inventar ni repetir rutas internas de archivos.

## Resultado esperado

La salida humana debe parecerse a:

> Listo. Te preparé una versión PDF para imprimir y una Word editable.

seguida por el preview visual y las tarjetas PDF / WORD.

No:

> [PDF](sandbox:/mnt/data/...)  
> [DOCX](sandbox:/mnt/data/...)

## Arquitectura

No cambia el Capability Runtime, el ledger, provenance, permissions ni storage.

Build 79.1 es exclusivamente Human Surface y presentación.

## PWA

Build source: `2026.10.04.79.1`  
Service Worker: `isabella-shell-v91`
