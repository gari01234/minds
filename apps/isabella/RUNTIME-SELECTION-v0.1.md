# MINDS Runtime Selection Policy v0.1

Fecha: 2 de octubre de 2026. Derivada de Build 72.5A, 72.5B y 72.5B-EVAL.

## Decisión actual

`native_minds` permanece como **runtime primario por defecto para todas las Missions de producción**.

`openai_agents` permanece disponible únicamente como **execution-plane shadow candidate**. No existe selección automática hacia Managed Agents en v0.1.

Esta decisión no afirma que Managed Agents sea peor en abstracto. Afirma algo más estrecho: bajo el capability envelope probado —`environment:none`, sin tools, sin MCP, sin Computer Use y sin multi-agent— la sesión durable no produjo una ventaja de resultado suficiente para justificar su latencia y volumen adicional de tokens.

## Evidencia

La evaluación final utilizó cinco Missions sintéticas, aisladas de memoria y proyectos personales:

1. **Multi-source conflict** — ocho registros fechados, una afirmación conflictiva no autoritativa y una resolución posterior de autoridad.
2. **Durable continuity** — dos episodios; una preferencia inicial de embodied carbon y una restricción de mantenimiento posterior que obliga a cambiar la recomendación.
3. **Deferred synthesis** — dos episodios; un dato acústico ausente bloquea inicialmente la recomendación y una evidencia posterior resuelve la dependencia.
4. **Decision gate** — dos opciones objetivamente válidas requieren una preferencia privada del usuario.
5. **Provenance discipline** — evidencia contractual, externa, recordada por el usuario e inferida deben permanecer separadas.

Los dos casos multi-episodio reutilizaron la misma Agent Session de OpenAI. Native reconstruyó el segundo checkpoint a partir del snapshot de MINDS, su resultado previo y la nueva evidencia.

### Resultado por criterio

No se utilizó un score agregado. Se evaluaron de forma separada:

- resolución;
- incertidumbre;
- procedencia;
- necesidad de intervención del usuario;
- continuidad cuando aplicaba.

**Native Minds**

- conflict: todos los criterios pass;
- continuity: todos los criterios pass;
- decision_gate: todos los criterios pass;
- deferred: resolución, incertidumbre, user gate y continuidad pass; provenance partial;
- provenance: todos los criterios pass.

**OpenAI Agents**

- conflict: resolución, incertidumbre y user gate pass; provenance partial;
- continuity: resolución, incertidumbre, user gate y continuidad pass; provenance partial;
- decision_gate: todos los criterios pass;
- deferred: todos los criterios pass;
- provenance: todos los criterios pass.

Ambos runtimes acertaron el resultado sustantivo de los cinco casos. Ambos conservaron continuidad correctamente en los dos casos con segundo episodio.

### Token volume observado

| Caso | native_minds | openai_agents pipeline |
| --- | ---: | ---: |
| conflict | 1,690 | 10,330 |
| continuity · 2 episodios | 2,652 | 18,703 |
| decision_gate | 949 | 8,714 |
| deferred · 2 episodios | 2,462 | 18,354 |
| provenance | 1,116 | 9,286 |
| **Total** | **8,869** | **65,387** |

El pipeline Agents incluye Agent Session + normalizador estricto de MINDS. En los segundos turns hubo input cacheado, por lo que esta tabla mide volumen total de tokens y **no debe interpretarse directamente como coste monetario relativo**.

Volumen total observado: Agents ≈ **7.37×** native.

### Latencia observada

| Caso | native_minds | openai_agents pipeline |
| --- | ---: | ---: |
| conflict | 7.0 s | 66.8 s |
| continuity · 2 episodios | 12.8 s | 74.6 s |
| decision_gate | 3.6 s | 49.7 s |
| deferred · 2 episodios | 10.3 s | 128.6 s |
| provenance | 4.9 s | 69.7 s |
| **Total** | **38.5 s** | **389.3 s** |

Agents fue ≈ **10.1×** más lento en tiempo acumulado observado.

Estos tiempos son una muestra pequeña de producción, no un benchmark estadístico de servicio.

## Qué demuestra la evaluación

### 1. La continuidad de MINDS ya es fuerte

En los casos de dos episodios, reconstruir el segundo checkpoint desde:

`Mission Workspace + resultado anterior + nueva evidencia`

fue suficiente para igualar la continuidad semántica de una Agent Session persistente.

Por tanto, **durabilidad de conversación por sí sola no es actualmente una razón suficiente para enrutar a Agents**.

### 2. El Mission Workspace funciona como memoria de trabajo portable

La evaluación refuerza la decisión de Build 72.5A: el estado importante vive en MINDS, no dentro del provider session. El runtime puede cambiar sin perder el objetivo, la procedencia o las dependencias abiertas.

### 3. Managed Agents sí funciona como execution plane

Build 72.5B demostró que MINDS puede:

- crear una Agent Session real;
- conservarla entre turns;
- inspeccionar lifecycle y turns;
- recuperar su final answer;
- normalizarla mediante Responses + JSON Schema estricto;
- mantener cero write-through.

Eso sigue siendo una capacidad válida; simplemente no debe activarse sin una necesidad que native no cubra.

## Política de selección v0.1

### Ruta por defecto: native_minds

Usar `native_minds` cuando el trabajo pueda resolverse mediante:

- uno o varios checkpoints reconstruibles desde Mission Workspace;
- síntesis de evidencia ya disponible;
- decisiones y preguntas sin herramientas externas;
- continuidad que MINDS pueda representar explícitamente en summary, items y dependencias;
- razonamiento que no necesite conservar un environment del proveedor.

Esta es la ruta de producción actual.

### No activar Agents solo por

- que la tarea sea “difícil”;
- que tenga varios documentos;
- que dure más de una conversación;
- que tenga dos o varios episodios;
- que necesite recordar una conclusión anterior;
- que requiera una pregunta al usuario.

La evaluación muestra que esas propiedades no bastan por sí mismas.

### Candidatos futuros para openai_agents

Agents solo debe volver a considerarse cuando la Mission requiera una capacidad que no haya sido demostrada eficientemente por native, por ejemplo:

- environment persistente con archivos o artefactos de trabajo;
- ejecución de código o manipulación de archivos entre turns;
- workflows donde el estado del entorno, no solo el estado cognitivo, deba sobrevivir;
- uso de herramientas/MCP durante una sesión durable;
- delegación multi-agent justificadamente paralelizable;
- trabajo de muy larga duración cuyo contexto reconstruido empiece a ser materialmente más costoso o frágil que una sesión gestionada.

Estas capacidades son **hipótesis de routing**, no permisos ya concedidos. Requieren benchmarks separados antes de producción.

## Regla de producto

Isabella no debe exponer al usuario una elección de runtime.

El usuario expresa el objetivo. MINDS decide el execution backend según capacidades verificadas y autoridad disponible.

Mientras no exista evidencia suficiente para una ruta Agents:

```
Mission Run
    ↓
native_minds
```

Agents puede seguir ejecutándose en shadow para investigación:

```
Mission Run
    ├── native_minds / primary
    └── openai_agents / shadow
```

Nunca se utilizará una puntuación global opaca para escoger runtime. La decisión futura debe ser explicable por capacidades concretas requeridas por la Mission.

## Próxima frontera experimental

No avanzar todavía a 72.5C Controlled write-through.

La próxima evaluación útil debe probar **una capacidad diferencial**, no volver a comparar razonamiento puro:

1. environment OpenAI-hosted + artefacto persistente, o
2. tools/MCP con una Mission durable, o
3. varios turns sobre un contexto suficientemente grande para que la reconstrucción native sea material.

Hasta que uno de esos experimentos demuestre una ventaja concreta, `native_minds` sigue siendo el runtime adecuado para producción.
