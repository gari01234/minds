# Isabella «como Claude» · publicación 2 (13.11.2026)

Segunda parte del encargo de Gari (11.11.2026): que Isabella y Romy interpreten el contexto como lo
hace Claude y dependan de menos reglas de control, **sin ser menos capaces**. Esta publicación toca
cómo piensa, así que viene con un banco de pruebas que compara el camino anterior con el nuevo.

## 1. Una sola autora

Hasta ahora un segundo modelo leía cada mensaje antes que Isabella y decidía qué tipo de turno era,
a qué proyecto pertenecía, cuánto debía pensar, qué instrucciones y cuánto contexto recibiría. En
127 turnos reales (26.10–09.11) costó una media de 3,5 s de 8,8 s, y cuando clasificaba mal ella
respondía con menos de lo que necesitaba.

Ahora lee ella, con un prompt estable, todas sus herramientas y un contexto compacto. Lo único que
se decide antes de que lea es estructural:

- un Thread de Work se queda en su Thread;
- un mensaje que nombra exactamente un proyecto (o un archivo suyo) pertenece a ese proyecto; el
  nombre es un identificador, no una palabra clave de intención, y dos nombres no deciden nada;
- un saludo a secas se responde con menos deliberación (las mismas herramientas, el mismo contexto).

**Nada se precarga.** Un proyecto nombrado es un puntero y ella lo lee con `search_work` cuando la
respuesta lo necesita; `search_work` devuelve lo que coincide, y el modelo completo del proyecto solo
si lo pide (`include_project_model`). En 24 turnos reales que precargaban un proyecto entero
(275.000–380.000 caracteres cada uno), 22 solo tocaron la agenda.

**La profundidad la pide ella**: `think_deeper` pasa el turno a su razonamiento más capaz, una vez
por turno, en lugar de que un enrutador la adivine (acertaba «deep» en un 5 % de los turnos).

**Su conversación es una.** El historial que lee son sus últimos 24 turnos, del proyecto que fueran
(solo mensajes canónicos; los antiguos nunca se promueven). Además, un «sí» anterior ya no se come a
uno posterior al juntar el historial.

`ISABELLA_ROUTER=on` devuelve el camino anterior sin tocar código.

## 2. Notas cortas en lugar de bloques largos

Los bloques heredados (33.000 caracteres, elegidos según el veredicto del enrutador) se sustituyen
por notas de propósito: qué es cada capacidad y para qué sirve. La mecánica vive en la descripción de
cada herramienta, que es donde ella la usa. Un turno estándar pasa de ~32.000 a ~23.000 caracteres de
instrucciones, y es **el mismo texto en todos los turnos**, así que el proveedor lo reutiliza de su
caché. `ISABELLA_DETAILS=legacy` devuelve los bloques.

Lo que los bloques decían de propósito se conservó en las notas; lo comprueba
`tests/isabella-own-turn.test.mjs`.

## 3. El banco de pruebas

`tests/bench/isabella-scenarios.mjs` contiene 31 momentos inventados de una conversación y lo que una
asistente capaz haría con cada uno: una cita dictada, la captura de un correo, un «sí» a su propia
oferta, un cambio que debe pasar por tarjeta, una pregunta de proyecto, «todas las apariciones», un
objetivo largo, una expectativa, una vigilancia que debe comprobar antes de prometer, un cambio de
rutina, algo para imprimir, dos líneas para copiar, una habilidad que le enseñaron, una comparación
difícil de tres ofertas, un saludo, una noche de cansancio, y lo mismo en alemán para Romy. **Ninguna
persona, cliente ni proyecto real de Gari aparece en ellos.**

`scripts/bench-isabella.mjs` juega cada momento dos veces: por el camino anterior (con el enrutado
acertando siempre, los bloques largos y el proyecto entero precargado: su mejor caso) y por el nuevo.
Puntúa **lo que ella hace**, nunca cómo lo redacta, y marca en rojo cualquier cosa que el camino
anterior resolvía y el nuevo no. No toca ninguna base de datos ni crea nada, y usa la clave dedicada
de pruebas.

## Orden de publicación

1. Ejecutar el banco (`Isabella bench (capability)`, a mano, con `ref` en esta rama).
2. Solo si no se pierde nada: fusionar, desplegar `isabella-chat`, sincronizar Office y desplegar.

## Pendiente

- Propuesta 2 (banco con casos reales suyos), 7 (correo y calendario de la oficina conectados),
  8 (una app con dos perfiles), 9 (permisos del token de Office).
- D5: probar `gpt-6-luna` y `service_tier:"priority"` sin cambiar modelos.
