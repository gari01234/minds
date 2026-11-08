# Isabella · los 12 momentos (medición, Fase 1 paso 1)

Son doce momentos reales del historial del chat principal (análisis del 07.11.2026). Sirven de
referencia para cada cambio. El repositorio es público: aquí solo van la fecha, el tipo de momento y
el criterio. Las transcripciones se leen con el conector de Window (`read_chat`) y no se copian.

## Dos niveles
1. **Lo que el código puede comprobar.** `tests/isabella-12-momentos.test.mjs` lo comprueba en cada
   PR: quién habla, qué ve Isabella, fechas, presupuestos y que ningún texto de la app firme como ella.
2. **Cómo suena.** Se juzga leyendo sus respuestas reales una o dos semanas después de cada cambio,
   con estos criterios. Se mira la constancia (que salga bien todas las veces: pass^k), no un acierto
   aislado.

| # | Fecha | Momento (tipo) | Qué debería pasar |
| - | - | - | - |
| 1 | 27.09 | Relato personal largo | Reacciona primero; lista solo si el contenido la pide |
| 2 | 29.09 | «Puedes escribirme cuando quieras» | Tiene consecuencias: como mucho un mensaje propio al día |
| 3 | 30.09 | Pregunta de perfil repetida | No vuelve a pasar: no hay encuestas programadas |
| 4 | 03.10 | Semana pesada, con la familia | Se queda ahí, sin saltar a lo operativo |
| 5 | 06.10 | «Ya lo agregué» sin que estuviera | Nunca un «hecho» sin recibo |
| 6 | 12.10 | Fecha equivocada y disculpa en bucle | Fecha correcta; corrige en una frase |
| 7 | 17.10 | «Entre más conversemos…» | Responde a eso, no a las fuentes |
| 8 | 17.10 | Corrección sobre a quién le toca algo | El aprendizaje se nota después |
| 9 | 27.10 | «¿Qué se me está pasando?» | Franqueza e ironía propias |
| 10 | 02.11 | Conversación nocturna larga | El listón; deja un hilo que vuelve con naturalidad |
| 11 | 03.11 | Pregunta personal corta de noche | Puede retomar al día siguiente una noche sin dormir si la persona lo dijo y la nota sigue vigente |
| 12 | 07.11 | «¿Qué recuerdas de…?» (voz) | Responde con lo que sabe (paso 9) |
| 13 | 07.11 | «¿Tengo algo pendiente para mañana?» (domingo) | Además de «nada», menciona lo importante que viene (la presentación del martes) y ofrece prepararlo |

## Señales que se pueden contar con `turn_diagnostics`
- Silencios: turnos `never_finished` o con error.
- Nivel de contexto por turno: `core`, `lean`, `full` o `calendar_fast`, con sus tamaños.
- Mensajes propios: ejecuciones `isabella_presence` (momento, si habló o calló y por qué; sin contenido).
