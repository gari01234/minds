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

## V2 · Live dentro del chat (28.11.2026)

Gari aprobó V2: la conversación en vivo ya no abre una página aparte. «Conversar en vivo» abre la misma página de Live en una hoja sobre el chat (`#liveSheet`, un marco con `allow="microphone; autoplay"`). El chat sigue visible y se llena mientras se habla:

- Cada turno se guarda con `save_transcript`. Después del recibo comprobado, la página de Live avisa al chat (`postMessage`, solo al mismo origen). El chat vuelve a leer la conversación.
- El final de la sesión hace lo mismo.
- Además, la suscripción en tiempo real del chat lee los turnos con `source: 'isabella_live'`.
- Si la página de Live va dentro de un marco, se ve compacta: sin cabecera ni título, con la onda más baja y la voz en una línea.
- Los enlaces para revisar una propuesta abren el chat completo (`target="_top"`).
- Cerrar la hoja detiene la sesión.

El enlace `./live/` sigue funcionando sin JavaScript, como página propia. Entonces Live se abría desde la superficie del dictado; desde el 28.11 tiene su propio botón (sección siguiente).

La duración máxima de una sesión era entonces de 90 segundos; desde el 28.11 no hay límite fijo (sección siguiente).

Prueba: `tests/isabella-live-im-chat.test.mjs`. Publicar la PWA; no cambia ninguna función ni hay migración.

## Live como en Claude: sin límite fijo y con su propio botón (28.11.2026)

Gari decidió, después de ver cómo lo hace Claude: «hazlo así como recomiendas … pero sin el máximo de 30 minutos. Los botones también hazlo como lo recomiendas, o sea como Claude».

- **Duración:** ya no hay límite fijo. La conversación sigue hasta que se pulsa Finalizar. Como GPT-Live se paga por segundo y el silencio cuenta como tiempo activo, se cierra sola tras 2 minutos sin que nadie hable (`IDLE_MS`). No se cierra mientras una consulta al chat sigue en camino o espera su delegación. Cada frase transcrita, propia o de Isabella, y cada delegación reinician los 2 minutos; también escribir en la revisión.
- **Botones:** en la barra de escribir hay dos botones distintos, como en Claude. El micrófono dicta («Dictar»): lo dicho se vuelve texto. La onda de sonido junto a él («Conversar en vivo», `#liveButton`) abre Live en la hoja sobre el chat. El enlace «Conversar en vivo · Nuri» dentro del dictado se quitó; cada botón hace una sola cosa. No es un segundo micrófono: es otro símbolo con otra función. Sin la hoja, el botón abre Live como página propia.
- **Textos:** las líneas de Live que se veían solo en español también salen en alemán en el Office, y el alemán usa «Sie».

Prueba: `tests/isabella-gpt-live-pilot.test.mjs`, `tests/isabella-live-im-chat.test.mjs`, `tests/isabella-canonical-voice-replies.test.mjs`. Publicar la PWA; no cambia ninguna función ni hay migración.
