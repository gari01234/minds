# Isabella · Fase 1, pasos 5 a 8 (núcleo, diálogo, verificación, iniciativa)

Fecha: 08.11.2026. Pedido de Gari: «Adelante con los siguientes pasos, avanza todo lo que puedas»,
y antes: «Ten cuidado con el consumo de tokens».

## Medición de partida (turn_diagnostics, 27.10–07.11, 128 turnos)
| Tipo de turno | Cuántos | Instrucciones | Contexto | Herramientas |
| - | - | - | - | - |
| Chat global, nivel completo | 16 | ~52k car. | ~106k car. | ~43k car. |
| Chat global, nivel ligero | 12 | ~10k | ~28k | ~39k |
| Chat con ruta Work | 26 | ~52k | ~415k | ~43k |
| En segundo plano (avisos y preguntas del navegador) | 65 | ~50k | ~70k | <1k |

## Paso 6 · Un núcleo para toda la conversación global
- `_shared/isabella-core.mjs`: quién es, cómo responde, qué significa la verdad para ella, el tiempo
  y la continuidad. Su carácter sigue siendo el contrato de relación (`relationship-policy.ts`), que se
  incluye entero.
- Una nota corta por capacidad, y solo si el turno la ofrece. El procedimiento está en las
  herramientas y en el servidor.
- Se aplica a todos los turnos globales: ligeros, normales y profundos. Los turnos con ruta Work y
  los Threads de Work conservan su prompt completo.
- Contexto del nivel `core`: la agenda va entera. Lo que la memoria nocturna ya cubre se recorta
  (modelo personal sin evidencias, actividad y feedback compactos, recuerdos ≤10). El orden va de lo
  estable a lo que cambia cada minuto, para que el proveedor reutilice el prefijo en caché.
- Efecto en un turno global normal: instrucciones de ~52k a ~16–18k caracteres; contexto de ~106k a
  unos 40–50k. Los turnos ligeros suben unos 7k caracteres de instrucciones estáticas (cacheables)
  porque ahora llevan el mismo núcleo.

## Paso 5 · La conversación como conversación
- El modelo recibe los últimos 12 mensajes del ámbito como turnos de diálogo: los de Gari como suyos,
  los de Isabella como de ella y los avisos de la app como notas etiquetadas. Antes iban como un JSON
  de «evidencia».
- Los cuatro últimos mensajes llegan hasta 2.400 caracteres y los anteriores hasta 1.200, con hora
  local, para que note los intervalos. Como mucho son ~4,8k caracteres más que antes.
- El resumen de lo hablado antes de esa ventana (`memory_checkpoint.summary`) va en el contexto `core`.
- El resumen matinal entra en el ámbito global, así que Isabella lo ve si Gari le contesta.
- Corrección: el marcador de autor de los avisos se perdía al fusionar el historial; ahora se conserva.

## Paso 7 · Verificar en vez de sustituir
- En un turno con cambios pendientes, la línea de sistema y la tarjeta siguen siendo la autoridad.
- Las palabras de Isabella se muestran encima, solo si no dicen que el cambio ya está hecho
  (`_shared/reply-verification.mjs`). Si lo dicen, se ocultan en ese turno y queda solo la línea de
  sistema, como antes.
- El resultado de la herramienta le dice al modelo que el cambio todavía no está aplicado.

## Paso 8 · Escribir primero, como mucho una vez al día
- `isabella-presence`, dos comprobaciones al día (11:17 y 17:43 en invierno).
- Primero decide el código, sin llamar al modelo: si está desactivado, si ya escribió hoy, si es fuera
  de 10–20 h, si Gari está conversando o si no hay nada.
- Si pasa, una llamada pequeña (~10–14k caracteres) decide hablar o callar. Por defecto calla.
- El mensaje entra en el chat global (ámbito global, una clave por día) con un aviso push. Si sale de
  un hilo, el hilo se marca como retomado.
- El navegador deja de lanzar sus turnos de fondo: el «nudge» cada 6 h y la pregunta de perfil cada
  ~30 h, por dispositivo, con el prompt completo.
- El ajuste «Isabella puede escribirme primero» lo apaga.

## Tokens
- Ahorro principal: los turnos de fondo (~4–5 al día con ~120k caracteres cada uno) pasan a como
  mucho dos comprobaciones pequeñas. Le siguen los turnos globales normales.
- Lo que sube: la ventana de diálogo (≤4,8k caracteres) y las instrucciones de los turnos ligeros
  (estáticas, cacheables).
- Sin cambios: los turnos con ruta Work, que siguen siendo los más grandes (~500k caracteres por
  ronda, sobre todo por la precarga de Work). Es la siguiente oportunidad de ahorro, pero toca la
  calidad de Work y queda para una decisión aparte.
