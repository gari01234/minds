# MINDS — Agent Runtime Parity: auditoría y experimento aislado

Estado: SPIKE, sin cambios de producción. Fecha: 2026-10-17.

## Decisión que se evalúa

La meta de Isabella es ser una asistente intelectual/personal competente, no reproducir por cuenta propia cada componente de la infraestructura de agentes. El runtime debe ser reemplazable y no puede convertirse en la fuente de verdad de memoria, permiso, tareas ni conocimiento.

Se contrastan tres implementaciones: A) bucle actual `isabella-chat` sobre Responses API; B) Agents SDK ejecutando el ciclo en infraestructura de MINDS; C) Agents API con harness de Codex administrado por OpenAI. Este spike no propone un cambio de modelo ni de personalidad.

**Build 93.4 — Evidence-First Investigation permanece como requisito funcional, independiente del proveedor de ejecución**: descubrimiento transversal, inventario de evidencia con versión y localizador, control de cobertura y verificación antes de sintetizar. Un harness gestionado no vuelve exhaustivo por arte de magia un buscador top-k.

## Alojamiento verificado: hechos frente a supuestos

Inspeccionado mediante conectores (17/10/2026):

- Supabase `lodexwyyynlarkqgkyhy`: proyecto saludable en `eu-west-1` (Irlanda). PostgreSQL almacena conversaciones, memoria autobiográfica/operativa, Work, Claims, segmentos Docling, trazas y permisos; Supabase Storage tiene buckets PRIVADOS `minds-work`, `isabella-uploads`, `minds-artifacts`, `minds-artifact-intake`. RLS está configurada en tablas examinadas, incluidas `conversation_messages`, `minds_work_files` y `minds_work_source_segments`. RLS requiere auditoría endpoint por endpoint; no inferir aislamiento perfecto de la mera presencia de políticas.
- Railway proyecto `MINDS Docling Private`, servicio `docling-serve`, despliegue SUCCESS en región `europe-west4-drams3a`; sin volúmenes adicionales listados. Servicio de extracción, NO almacén canónico; API protegida. Región de ejecución ≠ garantía integral de residencia de todos los datos, logs y subprocesadores.
- Código de frontend y CI en GitHub, PWA servida por GitHub Pages. No hay garantía de que GitHub Pages aloje todas las copias en la misma región que Supabase.
- `isabella-chat v112`, Edge Function activa, JWT habilitado; 4.253 líneas de `index.ts` de producción (~300 KB). Se observan controles propios de rondas, contexto, herramientas, recuperación de documentos, permisos y resultado. No asumir que todas las líneas son sustituibles por un SDK.
- Ya se llama a OpenAI Responses API desde Supabase. `readWorkFile` y extracción de fuentes pueden enviar **el archivo original en base64** al proveedor; los contextos de chat envían fragmentos y memoria. Una ruta de background usa `store:true`. El proyecto actual **no** debe presentarse como EU-only o ZDR sin verificar su configuración contractual/API. `store:false` no implica ZDR por sí solo.
- Evidencia QA: run 81c143ae-1395-408d-b785-e59f7257fd74: 77.840 ms, success, 6 rondas, `browse_work_sources` usado, 52 segmentos/12 archivos; cero fragmentos admitidos del Kick-off relevante. El anterior run fe07b2b0... admitió 93 fragmentos e incluyó Kick-off, pero perdió la entrega. No hay paridad validada a día de hoy.

**No se ha inspeccionado** la configuración de residencia/retención del proyecto API de OpenAI, un DPA de la oficina, copias de seguridad de terceros, todas las rutas de datos o todos los permisos: permanecerán como cuestiones abiertas.

## Cómo fluirían los datos

A: usuario → Isabella PWA → Supabase Edge (bucle propio) → OpenAI Responses con contexto filtrado → herramientas autorizadas en Supabase → respuesta y memoria en Supabase.

B: usuario → Isabella PWA → MINDS runtime que aloja Agents SDK (bucle gestionado por SDK en nuestro servidor) → OpenAI modelo/API → mismas herramientas scopeadas sobre Supabase → resultado canónico en Supabase. **La ubicación de la aplicación no determina la residencia del procesamiento del modelo.** No existe sesión duradera automática con retención US específica de Agents API; permanecen los controles propios del endpoint/modelo seleccionado y del almacenamiento de la aplicación.

C: usuario → Isabella PWA → MINDS gateway → OpenAI Agents API (sesión/orquestación gestionadas, actualmente con retención de sesión y residencia solo EEUU, NO ZDR) → function tools respondidas por MINDS o MCP restringido → Supabase. Los originales pueden permanecer en Supabase, PERO instrucciones, consultas y fragmentos devueltos al agente entran en sesiones de OpenAI. Un sandbox self_hosted dentro de la UE **no elimina** las restricciones de residencia/ZDR del harness gestionado.

La integración C debe empezar con **`environment.type="none"`**, herramientas ficticias read-only y datos sintéticos, sin subir archivos reales ni claves de servicios al agente. Un sandbox alojado por OpenAI se valora después, solo si aporta capacidad demostrada y se autoriza el tratamiento de datos.

## Qué conservar y qué puede simplificarse

**Propiedad permanente de MINDS/Supabase**: identidad de Isabella, memoria autobiográfica (con procedencia), Readings y anotaciones, Work y originales inmutables, versiones, Expectations/Commitments, Personal Operating Model, políticas de autoridad, confirmaciones, trazas auditables y resultado persistido. Ningún agente remoto escribe directamente la fuente de verdad ni autoaprueba Claim.

**Candidato a delegación si supera pruebas**: ciclo de llamadas al modelo, gestión de sesiones/compactación de contexto, continuidad de investigaciones largas, coordinación de herramientas read-only, planificación interna, control de flujo de una investigación y entrega asíncrona. Entrega final, aprobaciones y memoria aceptada **siguen** bajo contrato de MINDS.

**No delegar ciegamente**: cobertura del conocimiento, recuento de ocurrencias, verificación de citas, categoría arquitectónica (Caféraum frente a Luftraum), identidad/versionado de documentos y coherencia temporal. Esas capas son requisitos del resultado, no beneficios automáticos de cambiar de runtime.

## Experimento A/B/C con puertas de seguridad

Fase 0, ya creada en este branch: corpus 100% ficticio `tests/fixtures/agent-runtime-parity-synthetic-v01.json`, scanner que recorre TODO el corpus textual y test de calidad/procedencia. Oculta deliberadamente una ocurrencia después del segmento número 12 de un documento. Incluye vacíos, tablas programáticas, un archivo sin extracción y dos ocurrencias de valor idéntico con categoría distinta. Las pruebas automáticas establecen el **contrato**; no constituyen un resultado de inferencia.

Fase 1 (sin secretos personales): obtener un API project/key con scopes explícitos `api.agents.read`, `api.agents.write`, `api.responses.write`, presupuesto máximo y autorización apropiada. Ejecutar **en contexto aislado** los tres recorridos con el mismo conjunto de datos y, si es compatible, el mismo modelo, razonamiento e instrucciones. Si los modelos no coinciden, marcar el resultado como comparación end-to-end, NO como aislamiento del harness. Herramientas de prueba solo leen el fixture; sin internet externo, sin acceso al proyecto real, sin escrituras.

Fase 2: medir sobre al menos tres formulaciones (directa, paráfrasis sin etiqueta exacta, comparación transversal): todos los identificadores de evidencia, omisiones/duplicados, localizadores, fuente actual, reconocimiento de no extraídos, clasificación, tratamiento de cronología, latencia p50/p95 de muestras repetidas, número de llamadas/rondas, tokens, gasto real, entrega después de perder conexión y recuperación sin reejecutar. Guardar resultados reducidos sin texto privado, con `provider`, `model`, `tool_contract_version`, `fixture_version`.

Fase 3, **solo con decisión explícita**: lectura read-only de una muestra profesional expresamente autorizada, con el mismo filtro de relevancia y el mismo conjunto de herramientas. Para Agents API primero revisar residencia US, política de retención y las obligaciones de confidencialidad. No habilitar escrituras ni nuevo canal de memoria.

Criterio de promoción: como mínimo igual cobertura, procedencia y honestidad de límites que baseline; ninguna acción sin aprobación; entrega durable; calidad, coste y latencia medidos. El mayor throughput no compensa perder evidencia. Si A/B/C se comportan igual de bien, preferir la vía más simple que cumpla privacidad y continuidad. El cambio será reversible, canary, nunca una migración de datos.

## Preguntas de decisión

1. ¿El proyecto OpenAI de MINDS dispone de opciones contractuales/regionales pertinentes? No deducirlo de la región de Supabase. Revisar datos profesionales bajo acuerdos con Bauherren/Fachplaner.
2. ¿Agents API beta ofrece compatibilidad suficiente con el modelo y los controles que Isabella usa hoy? Confirmar scopes, eventos, límites y costes sobre una sesión de prueba.
3. ¿Agents SDK puede ejecutarse sin superar límites de tiempo/memoria de Edge Functions? Si no, reaprovechar el Capability Runtime existente, no añadir un segundo cerebro.
4. ¿El agente puede auditar coberturas de fuentes a partir de recibos de SQL y justificar las exclusiones sin copiar todo el texto en el prompt?
5. ¿Se puede demostrar recuperación de trabajos interrumpidos sin duplicar acciones o conversaciones?

## Referencias verificadas (17/10/2026)

- https://developers.openai.com/api/docs/guides/agents (comparación SDK/API/Responses)
- https://developers.openai.com/api/docs/guides/agents-api/overview (residencia EEUU y no ZDR)
- https://developers.openai.com/api/docs/guides/agents-api/architecture
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
- https://developers.openai.com/api/docs/guides/agents/sdk
- https://developers.openai.com/api/docs/guides/your-data
- Código de MINDS (Builds 79/79.2, `isabella-chat/index.ts`) y metadatos de producción consultados el mismo día.

**Estado actual de este spike**: infraestructura y restricciones auditadas; fixture/scorer listos y sujetos a CI; **ningún modelo administrado ha sido invocado en paridad**, ninguna migración, ningún acceso al Work real, ningún despliegue de Isabella. La decisión final de runtime sigue abierta.
