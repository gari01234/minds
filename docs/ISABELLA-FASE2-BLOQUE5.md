# La conversación de voz en Window

Live arranca con Nuri, el núcleo de Isabella y una adaptación breve para hablar. La función de sesión utiliza la identidad del usuario y RLS para leer las páginas centrales, la agenda local, el radar resumido, las preferencias temporales vigentes y los últimos turnos globales de versión 1. El historial usa mensajes con rol y una parte de texto. Se reservan bytes para el formato y se da prioridad a las intervenciones más recientes. Las instrucciones y el historial tienen presupuestos independientes.

Al solicitar una delegación, la aplicación elige la intervención de la persona por el intervalo temporal que señala Live. Por defecto consulta a Isabella automáticamente. La casilla de revisión permite corregir la frase antes de enviarla. Una propuesta crea una tarjeta de sistema en el chat y la voz espera a que la persona la confirme allí. Los fragmentos intermedios carecen de autoridad para aprobar una acción.

Los fragmentos de cada hablante forman un turno con una clave estable para envíos repetidos. Window guarda el texto con su autor, modalidad de voz y ámbito global v1. Comprueba por lectura la identidad y el contenido guardado. La respuesta al micrófono puede diferir de la respuesta escrita del backend. El historial conserva lo transcrito del audio y la tarjeta de revisión cuando corresponde. El audio no se guarda. El mismo repaso nocturno puede leer estos mensajes.

| Sesión inicial con Nuri, caracteres de fixture | Antes | Después |
|---|---:|---:|
| Instrucciones | 1.471 | 5.966 |
| Contexto separado | 2 | 2 |
| Input con contexto e historial | 2 | 285 |
| Herramientas de la API | 2 | 2 |

La medición usa `promptComponentSizes()`. El coste adicional en la configuración inicial corresponde al núcleo compartido y al historial. Las consultas delegadas pasan por el mismo chat. La prueba con multibyte verifica los límites de entrada para 200 mensajes candidatos. El tamaño real depende del historial y de la agenda.

Las pruebas `isabella-live-continuity`, `isabella-live-canonical-delegation` e `isabella-gpt-live-pilot` comprueban ambos modos de consulta, recibos, deduplicación, escritura global, límites y cierre. Tras revisión, desplegar `isabella-live-session` y `isabella-chat`, y publicar la PWA. La segunda función entrega las tarjetas cuando Live se cierra. No hay migración. Para volver atrás, restaurar estas dos funciones y la PWA de la revisión anterior.

D5 sigue pendiente. Falta comparar `gpt-6-luna` y `service_tier: "priority"` en los 13 momentos antes de decidir. Este bloque mantiene los modelos y el nivel de servicio vigentes.

Referencias técnicas de OpenAI: [sesiones e historial](https://developers.openai.com/api/docs/guides/live-conversations) y [delegaciones y transcripciones](https://developers.openai.com/api/docs/guides/live-delegation).
