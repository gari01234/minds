# Continuidad entre días

El repaso distingue la conversación que podrá retomar mañana de la memoria duradera. En las declaraciones reconocidas de ánimo, energía y sueño, separa la cita literal de la persona antes de construir el prompt para páginas e hipótesis. El modelo recibe un marcador fechado y selecciona una vigencia de tres a cinco días. El servidor repone la frase original en `isabella_estado`, comprueba quién habló y calcula la caducidad desde la fuente. Omite las frases cuya atribución resulte ambigua. El panel permite borrar juntas las notas y conserva solo una fecha de borrado para evitar que una repetición del mismo repaso las restaure.

`isabella_ayer` conserva un resumen del día local anterior y hasta tres asuntos abiertos. Ambas preferencias se filtran en cada lectura y se limpian en el repaso, incluso sin nuevas intervenciones. Los seguimientos se vinculan al ID de un evento leído para ese día y expiran a los dos días. La presencia puede retomarlos al abrir la aplicación o al cerrar el día. Las referencias compartidas pertenecen a la página de la relación. Un patrón requiere citas de episodios con fechas distintas antes de convertirse en una hipótesis.

| Turno y componente, caracteres de fixture | Antes | Después |
|---|---:|---:|
| Chat, instrucciones del núcleo | 5.617 | 5.777 |
| Chat, contexto consolidado | 25 | 216 |
| Chat, input | 12 | 12 |
| Chat, herramientas | 2 | 2 |
| Repaso, instrucciones | 3.374 | 4.159 |
| Repaso, contexto separado | 2 | 2 |
| Repaso, input | 462 | 550 |
| Repaso, esquema de salida serializado | 1.605 | 2.530 |

`tests/isabella-continuidad-efimera.test.mjs` usa `promptComponentSizes()`, con el esquema en el componente herramientas para poder comparar su tamaño. El repaso conserva una sola llamada al modelo por lote. La medición del chat suma 191 caracteres de contexto en este ejemplo. El momento 11 comprueba que se pueda retomar una noche sin dormir sin reiterar la pregunta.

Tras revisión, desplegar `isabella-dream`, `isabella-chat`, `isabella-presence` y `isabella-heartbeat` (desde el PR 309 este último llama directamente al código de presencia). Publicar la PWA. Se reutilizan dos claves de preferencias y las tablas existentes. Para volver atrás, restaurar las versiones anteriores y la PWA. Las claves son opcionales.
