# MINDS · UX A.7 · Controles diarios y consistencia cromática del calendario

**27/10/2026 · Intervención incremental sobre la PWA real.**

## El criterio

La pantalla principal de MINDS es el puesto de trabajo cotidiano de Gari: conversación de Isabella como actividad principal, Calendario / Hoy / Plan de trabajo simultáneos en desktop. No es una página de Chat aislada. Se parte de la interfaz real aceptada, no de los prototipos B1/B2. Se conservan la navegación, la disposición, el ORB, los recibos y las funciones del menú global.

Tres capturas de referencia privada señalan los controles del compositor (adjuntar, voz y enviar), un calendario mensual embebido de aspecto casi monocromo, y el calendario completo con los colores de proyectos/categorías. Es necesario respetar **una semántica cromática común**, aunque la composición del mini calendario siga siendo más ligera por su menor tamaño.

## Decisiones implementadas

**Compositor principal, escritorio ≥950px:** tres botones con región interactiva 44×44 px; «Enviar» es el único botón de relleno oscuro, adjuntar y voz comparten una superficie neutra mucho más discreta. Estados hover/active/focus, placeholder de mayor legibilidad, foco del compositor sutil, y respeto a Reduce Motion. No se modifican los IDs, los manejadores ni las operaciones asociadas. El pequeño compositor del rail y la versión móvil permanecen intactos. La guía Apple [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) establece criterios de jerarquía, tamaños táctiles y retroalimentación; se adaptan al lenguaje visual propio de MINDS, sin presentar la webapp como una interfaz nativa de Apple.

**Calendario compartido:** `calendar-colors.js` es el único contrato de presentación de colores para tareas y eventos: primero color de proyecto si existe, después categoría, y por último fallback determinista. Conserva los valores elegidos por el usuario. El calendario completo preserva sus filtros y recibe sus puntos de `colorsForItems`; el calendario mini recibe `colorsForDay`, usando los mismos métodos para ordenar, eliminar duplicados y limitar los puntos. El mini muestra hasta cuatro colores en lugar de tres puntos repetidos sin agrupación.

**Estados de fecha:** fondo oscuro y texto blanco para la fecha seleccionada; fecha actual en rojo cuando no es la seleccionada; días externos en gris secundario; sin alterar la navegación temporal. Ambos calendarios usan los mismos tokens CSS de color. No se homogeneizan tamaños de celda ni densidades: mini y completo son representaciones del mismo sistema a dos escalas distintas.

## Integridad técnica

Sin cambios de esquema, backend, tareas, proyectos, memoria, permisos o Source-First. No se aplican nuevos colores a datos persistidos; la paleta se deriva exclusivamente de los existentes. Nuevos assets publicados como `calendar-colors.js?v=1` y `daily-controls.css?v=1`; `app.js?v=130`, `dashboard.js?v=7` y Service Worker `isabella-shell-v167` mantienen la actualización coherente incluso con caché.

Pruebas: contrato Node de colores y carga, suites históricas versionadas, y Chromium real sobre el build de Pages (botones 44 px, menú completo y número de versión, viewport y colores RGB idénticos ante eventos/tareas sintéticos). Los resultados de CI no sustituyen aceptación visual física.

## Validación humana pendiente

En desktop, verificar que los iconos y botones se sienten discretos, el campo se lee bien, el envío sigue siendo la acción principal y el composer queda anclado al borde inferior. Cambiar el mes / seleccionar fecha en la columna lateral y comparar colores con el calendario completo del mismo día. En móvil, confirmar que no hubo regresión en el teclado, el compositor ni los filtros. Comprobar `•••` y la versión instalada.

El siguiente refinamiento debe abordar tipografía y espaciado de los cuatro paneles desde observaciones concretas, evitando reescrituras globales de Work o de la navegación.
