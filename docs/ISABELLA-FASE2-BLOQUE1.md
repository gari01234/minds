# Isabella fase 2 · Bloque 1 — identidad en Work y rutinas; tiempos por fase

**Base de comparación:** `main b9f9a0930d34d4cac56d75c5d91037b544080ac9`. PR independiente, sin despliegue. Corresponde al bloque 1 del encargo recibido el 08.11.2026.

## Cambio

El resumen matinal ahora utiliza `isabellaRoutineInstructions({relationship})` y el mismo `ISABELLA_CORE` de la conversación; el contrato específico prohíbe crear o modificar tareas, eventos y rutinas, revelar la arquitectura interna o buscar en la web si la instrucción no lo requiere. El contenido principal se presenta por importancia, no como informe rígido. La función existente sigue calculando horarios de agenda en hora local.

La rutina comienza en paralelo tres lecturas acotadas: sus fuentes de agenda habituales, páginas/hilos de memoria mediante `consolidatedMemoryView()` y `workRadar(sb,{userId})`. Las consultas de memoria llevan `user_id` explícito porque el proceso usa un cliente de servicio. Si falla la lectura suplementaria, la rutina existente puede continuar con el resto de información.

Work Threads y rutas Work utilizan `isabellaCoreInstructions()` con cinco fragmentos **copiados literalmente** del prompt heredado: segmentos documentales, Project Thread Mode, herramientas de Work, procedencia de los Claims y cuándo consultar Sofía. Se preservan `resolvedContext` completo, los permisos, el modelo, las herramientas y la fuente Work. Se añaden únicamente las páginas centrales `gari`, `relacion`, `isabella`; no se incluyen hilos ni páginas de terceros. `ISABELLA_WORK_CORE=off` recupera exactamente la rama anterior `system+(scheduleAssessment?...)`; el texto heredado no se elimina.

`phase_ms` mide `route`, `context`, cada ronda de proveedor (incluida lectura de su JSON) y `total`. Se guarda en la metadata del Agent Run y `turn_diagnostics` devuelve exclusivamente números limitados; nunca transcripciones, documentos ni prompts.

## Tamaños de componentes (caracteres)

Medición mediante `promptComponentSizes()` con **fixture sintético estable**, un input de una frase inventada, contexto de agenda vacío y lista de tools vacía. La columna de instrucciones de Work anterior corresponde a la porción literal del `system` heredado; el valor real del runtime variará con su relación, Skills, Tools y contexto.

| Tipo de turno / componente | Antes | Después | Diferencia |
|---|---:|---:|---:|
| Work estándar — instrucciones | 42.798 | 18.544 | −24.254 |
| Work — contexto sintético | 104 | 104 | 0 |
| Work — input sintético | 90 | 90 | 0 |
| Work — herramientas sintéticas | 2 | 2 | 0 |
| Rutina — texto literal de instrucciones | 861 | 6.507 | +5.646 |
| Rutina — agenda existente | sin cambio | sin cambio | 0 |
| Rutina — memoria y radar | no se inyectaban | hasta 12 páginas/2 hilos + radar acotado | aumento variable |

**Limitación de la comparación:** la rutina heredada contiene interpolación de política relacional en el template literal y el nuevo ejemplo usa una relación de prueba; por tanto las cifras de rutina son tamaños de plantilla/fixture, **no** tokens reales de una ejecución. El aumento está motivado por el uso del mismo núcleo conversacional y continuidad; hay que observarlo en `minds_ai_usage` antes de ampliar la frecuencia. El objetivo Work de menos de 32.000 caracteres se cumple en el fixture, pero no se garantiza sin medir sus herramientas reales.

## Verificación

`node --test tests/isabella-fase2-bloque1.test.mjs` comprueba la inclusión del núcleo y las reglas de rutina, la correspondencia textual exacta de los cinco párrafos Work, la exclusión de páginas de terceros, la palanca de reversión, el contexto sin recortar, el campo de tiempos y la sanitización. Sus logs muestran **solo cantidades de caracteres y contadores**, sin contenido. También deben pasar `node --test tests/*.test.mjs`, los siete jobs de CI y `deno check` de las funciones afectadas.

## Despliegue manual posterior a aprobación

`isabella-routine-runner`, `isabella-chat` y `window-mcp`. No requiere migración SQL ni publicación PWA. No se ha ejecutado ningún despliegue. Para regresar al comportamiento anterior de Work, definir `ISABELLA_WORK_CORE=off`; para revertir todos los cambios, revertir el commit del bloque tras revisión. El contrato de memoria y las funciones no alteran ni suprimen datos persistentes.

## Próximos bloques

El bloque 2 introduce únicamente la creación directa explícita con Deshacer (sin abrir las demás mutaciones). El bloque 3 incorpora transporte SSE y contexto paralelo de manera independiente. Los bloques 4 y 5 permanecen sujetos a sus pruebas de privacidad y continuidad. No probar `gpt-6-luna` ni `service_tier:"priority"` sin decisión posterior.
