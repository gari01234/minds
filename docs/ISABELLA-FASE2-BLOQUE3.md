# Respuestas de texto y carga del contexto

El navegador pide `stream_mode: "final_round"` a la misma función que gestiona herramientas y propuestas. Las rondas pueden decidir usar una herramienta hasta terminar. La aplicación transmite el texto marcado por el proveedor como respuesta final, descarta el comentario intermedio y retiene los fragmentos ambiguos hasta comprobar el resultado de la ronda. Una propuesta conserva el JSON canónico completo. La interfaz retira el borrador visible antes de validar sus recibos.

El índice único por propietario y `client_message_id` admite una sola ejecución. Una desconexión no dispara otra consulta al modelo. El servidor continúa, registra el JSON terminal y la PWA lo recupera mediante una lectura con RLS. Si el servidor declina expresamente antes de empezar, el navegador utiliza la vía JSON con el mismo identificador. Una petición reutilizada con contenido diferente se rechaza. La migración manual añade una columna JSONB al comprobante de entrega que ya caduca a las 24 horas.

El historial se precarga para un solo ámbito. Cuando el clasificador resuelve otro, se usa exclusivamente la consulta de ese ámbito. Actividad, feedback, modelo personal, memoria nocturna, radar y agenda empiezan junto con el clasificador. La ruta conserva la decisión de cuáles añadir y con qué límite.

| Medición con datos inventados | Antes | Después |
|---|---:|---:|
| Instrucciones, caracteres | 16 | 16 |
| Contexto | 10 | 10 |
| Input | 49 | 49 |
| Herramientas | 46 | 46 |
| Clasificación, ms simulados | 30 | 30 |
| Lecturas independientes, ms simulados | 50 | 50 |
| Ronda del modelo, ms simulados | 70 | 70 |
| Total, ms simulados | 150 | 120 |

La prueba usa `promptComponentSizes()` y un reloj simulado. Los resultados cuantifican el solapamiento posible en la fixture. La latencia de Window depende del dispositivo, de las fuentes y del proveedor. Los cambios de transporte no añaden instrucciones al modelo.

Pruebas en `tests/isabella-final-round.test.mjs`, junto con los contratos de ámbitos, transporte y tarjetas existentes. Tras revisión, aplicar manualmente `20261108123000_isabella_final_round_receipt.sql`, desplegar `isabella-chat` y publicar la PWA. Para volver atrás, restaurar la PWA y la función anteriores. La columna opcional puede permanecer.
