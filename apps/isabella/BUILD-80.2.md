# Build 80.2 — Ambient Interaction

Fecha: 5 de octubre de 2026.

## Problema observado

La primera instalación real de Isabella Presence demostró que Build 80 era arquitectónicamente correcto pero insuficiente como producto. La ventana se comportaba como un pequeño dashboard, no como presencia ambiental: era demasiado grande, el acceso conversacional redirigía a la PWA y la acción de ocultar/minimizar no era suficientemente evidente.

Esto se considera un fallo de aceptación de experiencia, no una razón para alterar MINDS o Capability Runtime.

## Objetivo

Acercar Presence al patrón de interacción aprendido de Coucou sin copiar su identidad visual:

- pill discreta;
- hidden when idle;
- tray como acceso persistente;
- panel contextual compacto;
- conversación breve inline;
- preguntas respondibles donde está Gari;
- trabajo visible sin obligar a abrir MINDS;
- aprobación/confirmación compleja permanece en MINDS.

## Cambios

La app pasa a versión `0.1.2`.

La ventana inicia oculta y con tamaño de pill. Si no existe sesión, el propio frontend abre la superficie de autenticación. Después de autenticarse, idle vuelve a ser invisible salvo apertura manual.

Presence se posiciona en el borde superior derecho del monitor activo mediante APIs de ventana de Tauri.

El panel incluye un composer local que invoca la misma `isabella-chat`. No existe endpoint nuevo, runtime nuevo ni conversación separada.

Las respuestas aparecen en el panel. Los quick replies regresan al mismo endpoint.

Cuando una respuesta genera una proposal canónica, Presence señala que requiere revisión y deriva a MINDS; no introduce botones allow/deny propios mientras el protocolo de propuestas siga residiendo allí.

## Lo que no cambia

- Supabase sigue siendo source of truth;
- Attention Economy decide surface;
- Capability Runtime ejecuta;
- Human Surface continúa definiendo el lenguaje humano;
- Permissions siguen siendo contextuales;
- memoria y conversaciones siguen siendo canónicas;
- Presence no recibe service role ni provider keys.

## Criterio de aceptación

Build 80.2 pasa si Gari puede mantener Isabella como una pill discreta, ocultarla a tray, expandirla temporalmente, escribirle y recibir respuesta sin abandonar el escritorio, mientras cualquier cambio que requiera confirmación conserva la ruta segura existente.

La shell debe seguir compilando en macOS, Windows y Linux, y el instalador Windows debe producirse como NSIS.
