# THEORY//LAB v0.5

Abre `index.html` en Edge, Chrome o Firefox. La carpeta funciona sin instalación y sin conexión. Conserva todos sus archivos juntos; si recibiste el ZIP, extráelo primero.

## MIND

Cada idea muestra párrafos recuperados de la conversación. «Expandir conversación y contexto completo» despliega las intervenciones disponibles; vuelve a pulsarlo para contraerlas. «Abrir conversación» permite leer y anotar ese mismo contexto. Los botones con nombres de autores llevan a las lecturas.

Las palabras del usuario y las respuestas del asistente están identificadas por separado. Los títulos de las tarjetas sirven para navegar; el desarrollo se conserva debajo. Las cifras de vitalidad y evidencia heredadas de v0.4 son ilustrativas.

## READINGS

Abre un autor, selecciona texto y pulsa «Subrayar selección» o «Añadir nota». Puedes abarcar varios párrafos y superponer subrayados. El panel de anotaciones permite añadir o editar notas, eliminarlas e ir al fragmento. «Ver todos los subrayados y notas» reúne también las anotaciones de conversaciones de MIND.

Contenido recuperado de «Reducción · sorpresa»:

- **Silvestrin:** lectura rigurosa completa disponible en la conversación.
- **Pawson:** entrega breve original completa sobre *Minimum*. No se recuperó una revisión extensa.
- **Morris:** lectura completa disponible sobre *Notes on Sculpture* I y II.
- **Reinhardt:** revisión extensa parcial, cortada al final por el límite de recuperación, y primera entrega completa sobre *Twelve Rules for a New Academy*. La interfaz señala ambos límites sin completar el texto.
- **Martin:** lectura completa disponible sobre *Beauty Is the Mystery of Life*.

Son las lecturas críticas escritas por el asistente en aquella conversación, no los libros o ensayos originales completos. No se añadieron textos externos ni se reconstruyeron partes ausentes. Los marcadores internos de imágenes y citas de ChatGPT no podían resolverse y se retiraron; se conservan los enlaces explícitos y el origen de cada intervención. Las afirmaciones históricas de la conversación se conservan como tales, sin nueva verificación.

## Guardado local

Las notas por pasaje se guardan en `localStorage`, con la clave `theorylab_v05_annotations`. Cerrar y volver a abrir la misma página en el mismo navegador y perfil conserva las anotaciones mientras no se borren los datos del navegador. El modo privado puede borrarlas al cerrar. Abrir otra copia, cambiar la ruta de la carpeta o usar otro navegador puede crear un almacenamiento distinto, especialmente con archivos locales. El ZIP contiene la aplicación y el corpus, no las notas que escribas después.

Si el navegador bloquea el almacenamiento o se queda sin espacio, la aplicación muestra un aviso y no afirma que haya guardado. No sobrescribe un registro de anotaciones que no pueda leer.

Las notas generales y los elementos fijados de v0.4 conservan sus claves originales, y pueden recuperarse cuando se usa el mismo origen de navegador. No se garantiza migración entre rutas locales distintas.

## Otras vistas

MEMORY, ASK y TOPOLOGY se conservan del prototipo. ASK sigue siendo una demostración de respuestas predefinidas: no tiene un modelo vivo, búsquedas reales ni acceso completo al nuevo corpus. Esta versión no conecta Supabase ni sincroniza dispositivos.

## Archivos

- `index.html`, `v05.css`, `v05.js`: aplicación.
- `corpus.js`: textos y relaciones usados por la interfaz.
- `fuentes-recuperadas.json`: copia legible del corpus, con autoría, fecha, identificador del turno y estado parcial.
- `graph.json`, `ontology.json`: material heredado de v0.4.

Validación: lectura de los cinco autores, expansión de contexto, selección de varios párrafos, subrayados superpuestos, guardado y recarga, edición, eliminación, navegación al fragmento y disposición móvil comprobados en Edge.
