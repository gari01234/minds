# Romy = Isabella · Fase 6 · Voz y conector Office

Referencia contractual: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, §§3.1–3.5 y fase 6. Preparado el 08.11.2026 exclusivamente en rama apilada sobre fase 5. Ningún merge, despliegue, migración ni conexión a datos reales.

## Único motor, dos perfiles

`isabella-live-session` es el mismo broker WebRTC, con `ASSISTANT_PROFILE=window` como rama predeterminada y `office` optativo. Window conserva su origen, voz original, textos base, admisión de transcripciones e instrucciones sin cambios por defecto. Office acepta `https://tbarchitekten.github.io` y también el origen de la app Window, porque una persona puede seleccionar la cuenta Office desde esa app; el origen por sí solo jamás concede acceso. Se exige JWT de Office, `office_members` activo y cambio de contraseña inicial concluido antes de formar un contexto de voz. El nombre de pila sale exclusivamente de la membresía autenticada, no de la petición.

Para Office, la voz de Isabella creada individualmente queda excluida; se elige una voz publicada. `buildVoiceSessionContext` adapta la identidad y el idioma, pero conserva el núcleo común y los límites de bytes. Las transcripciones enviadas por el navegador se tratan como texto del propietario; el backend rechaza las transcripciones atribuidas al agente y la PWA de Office ni siquiera intenta guardarlas. Ninguna voz, frase inferida ni respuesta no verificada autoriza cambios. Una petición sustantiva pasa al `isabella-chat` canónico con revisión explícita y recibo verificable. Los mensajes de fallo no se atribuyen a Romy como acciones.

Los módulos `apps/isabella/live/live.js`, `live/canonical.js`, `live/transcript.js` y `live/live.css` se comparten con Office por SHA Git. Los mensajes de estado de voz y los resúmenes canónicos están localizados en alemán únicamente si `APP_PROFILE=office`. La rama Window devuelve las cadenas originales. La página HTML alemana y el acceso visual son propios de la interfaz Office; no se crea un segundo runtime de voz.

## Conector

`office-mcp` no importa sesiones ni datos de Window. La capa de Office añade lecturas de `Projektakte`, `Themenblatt`, fragmentos citables por página y diagnóstico de turnos. Antes de cualquier lectura de Akte se comprueba de forma explícita `office_project_members.user_id = auth.uid()`, además de la RLS SQL. Incluso un administrador sin asignación queda excluido. Diagnósticos usa `minds_agent_runs.user_id` y devuelve solo estado, duración y fecha, nunca texto de conversaciones. El OAuth existente verifica el JWT de la persona y bloquea miembros inactivos.

## Aceptación automatizada

En el último test del perfil de voz, `promptComponentSizes()` sobre un contexto ficticio dio instrucciones 6232 → 6220 caracteres (Window → Office), contexto 221 → 220, input 2 → 2, herramientas 2 → 2 y número de herramientas 0 → 0. Son tamaños del fixture, no costes de tráfico real. `node --test` en la rama fuente registró 1230 tests aprobados, 0 fallidos, junto al `deno check` del motor. La suite de Chromium de Office ensaya WebRTC con dobles, envío al backend Office, transcripciones del propietario, rechazo de atribución al agente y revisión canónica. Los procedimientos OAuth/MCP se prueban por identidad y equipo con cuentas y proyectos inventados.

Esta aceptación no constituye un E2E real con micrófono, proveedor de voz, tokens de Office ni una cuenta de empleado. Claude deberá revisarlo antes de cualquier merge o despliegue.

## Decisión conservadora y reversión

No habrá push móvil de Office ni creación de voz original individual. La salida de Live jamás sustituye la confirmación del chat. `office-mcp` amplía inicialmente solo consultas de proyecto y diagnóstico, sin introducir herramientas nuevas de escritura de Akte ni una vía de D2. La reversión de esta fase consiste en retirar los commits de estas ramas y no publicar sus funciones ni recursos; no hay datos ni tablas que borrar.
