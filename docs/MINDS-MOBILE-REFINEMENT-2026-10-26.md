# MINDS · UX A.5 · Refinamiento de la interfaz móvil existente

**26 de octubre de 2026 · Cambios pequeños, reversibles y basados en las fotografías reales del iPhone.**

## Dirección corregida
Tras comparar las maquetas B1/B2 con la PWA existente, el propietario dejó claro que la interfaz actual es más limpia y preferible. La intervención busca perfeccionarla, no reemplazarla. **Se preservan** los seis destinos inferiores, el ORB, la conversación, Calendario, el lenguaje editorial de Lecturas, los componentes de Work y Thoughts. No se elige B1/B2, ni se modifica Design System v0.1 en bloque.

## Modificaciones
**Work > Panorama.** Los estados técnicos `not_started`, `in_progress`, `waiting`, `completed` se traducen a etiquetas humanas. Los estados sin mapping siguen visibles como no clasificados; el valor real, SQL, filtros, contratos y permisos no cambian.

**Work > Planner.** En pantalla estrecha, se muestra por defecto una lista de las mismas columnas/buckets y tarjetas, con acciones y estados intactos. El botón **Vista lista** permite regresar al tablero horizontal inmediatamente. Preferencia local, reversible y no asociada a datos canónicos. En escritorio permanece la presentación anterior.

**Lecturas.** Los filtros continúan horizontales y discretos. En móvil, el gesto permite detener el desplazamiento al inicio de una etiqueta completa; no se oculta ni reemplaza ningún filtro, nota, lector o conversación.

**Técnica.** Nueva hoja `mobile-refinement.css`, cargada tras los estilos existentes; CSS solo móvil. `work.js` evoluciona una revisión, Service Worker añade el archivo y cambia de versión. Pruebas de contrato del refinamiento.

## Aceptación pendiente en dispositivo
Verificar físicamente Panorama, los 12 buckets de Planner como lista, alternar a columnas y arrastrar tareas, entrar en archivos y subcarpetas, revisar Work Threads/Conocimiento, deslizar todos los filtros de Lecturas y abrir Sofía, y comprobar que Chat, ORB y Calendario permanecen idénticos. Probar lectura con texto ampliado, VoiceOver y teclado. **CI no sustituye aprobación visual en iPhone.**

Ni datos personales ni capturas reales se incorporan al repositorio. No hay cambios en Supabase, entidades canónicas, rutas de autorización ni capacidades de Isabella.
