# MINDS · UX A.6 · Isabella como puesto de trabajo diario

Fecha: 26/10/2026

## Dirección validada con el propietario

La pantalla principal no es «solo Chat»: es el espacio al que se entra cada día para conversar con Isabella, consultar el Calendario, las tareas de Hoy y el Plan de trabajo. Work es una superficie **complementaria** para organizar el horizonte semanal, revisar panorama/proyectos e incorporar Unterlagen/documentación para interpretación trazable. No es el punto de partida cotidiano.

El propietario aporta capturas reales de desktop (2048 × 1050) y señala una gran zona blanca **por debajo** del panel de Isabella y la columna derecha. Esta brecha debe tratarse como una regresión independiente. La regla aprobada es **refinar la pantalla real, no rediseñarla**.

## Alcance aplicado

1. Añadir una capa CSS **limitada a desktop ≥950px y a data-section="assistant"**. Define explícitamente viewport → swipeArea → assistantScreen → desk-shell → desk-layout, con una sola autoridad de tamaño y scroll dentro de cada panel. El panel de Isabella y el rail deben ocupar toda la altura disponible, dejando el compositor al pie del panel y sin página blanca exterior.
2. Corregir texto que hasta ahora era informativo pero se leía como decoración: #9x y #axx sobre blanco, tamaños 9–10 px. Texto de estado, fecha, hora, botones de cabecera y metadatos suben a contrastes objetivo ≥4.5:1 y mayor tamaño. Se mantiene separación clara entre texto primario y secundario.
3. Afinar controles de cabecera Calendario/Hoy/Plan y compositor principal: superficies clicables mayores en desktop, mejores estados de foco, placeholder legible. No cambiar la cápsula blanca ni el botón negro de envío.
4. Mantener sin cambios la navegación, la composición de escritorio, el ORB, Focus, paneles reordenables/minimizables, tareas, eventos, sesiones, recibos, permisos, frontend móvil, Work, Lecturas, Thoughts y runtime.

Archivos productivos: `apps/isabella/dashboard-daily-polish.css` y referencia en `index.html`/`sw.js`. Un archivo CSS nuevo y aislado es preferible a introducir excepciones dentro de varias capas históricas. Al cambiar el propio Service Worker y su lista de precache, una nueva instalación incorpora el estilo incluso offline; el nombre de cache se mantiene en esta revisión aditiva y se recargan las URLs actuales.

## Evidencia y aceptación pendiente

La suite estática comprueba selección estrecha desktop/assistant, recorte de altura y descendientes, contraste textual, preservación de rutas y cache offline. No es una prueba visual auténtica. **Necesario verificar en el desktop real**, idealmente en la misma ventana de las capturas: chat desde arriba hasta el límite inferior; compositor pegado al pie; columna derecha con scroll interno y paneles reordenables; reducir ventana por debajo de 950px; aumentar zoom a 125%/150%; comprobar paneles en focus Calendar y Hoy. Confirmar que ya no existe el hueco inferior y que no se oculta ningún botón. Si falla, corregir sobre captura y DOM calculado antes de avanzar.

No se tocan datos reales ni se ingresa material privado en documentación pública.
