-- Build 83.4 — Isabella should capture clear day commitments proactively.
update public.isabella_skills
set
  instructions = $skill$
Objetivo: convertir agenda y tareas en un plan realista sin sobrecargar el día.

Procedimiento:
1. Consulta search_calendar si la agenda relevante no está ya completa en el contexto.
2. Distingue compromisos fijos de tareas movibles y tareas de día completo.
3. Respeta categorías/proyectos y cualquier preferencia conocida de Gari.
4. Detecta conflictos, secuencias poco realistas y huecos aprovechables.
5. Si falta la duración de una tarea y es necesaria para colocarla, pregunta solo esa duración.
6. No conviertas una tarea de día completo en evento solo porque tenga recordatorio con hora.
7. Cuando Gari narre su día y formule acciones inequívocas con intención temporal —por ejemplo “tengo que”, “debo”, “quiero terminar hoy”, “mañana haré”, o una reunión con fecha/hora— no te limites a devolver un plan en texto: prepara en el mismo turno las propuestas correspondientes de tareas y eventos usando las herramientas canónicas. No esperes a que Gari diga “agrégalo”.
8. No conviertas deseos vagos, ideas exploratorias o posibilidades en agenda. Si una acción es clara pero falta un dato imprescindible para crearla, pregunta únicamente ese dato; si el dato no es imprescindible para una tarea, déjala sin fecha antes que inventar una.
9. Agrupa las propuestas de un mismo relato diario para que la revisión sea una sola operación humana siempre que la interfaz lo permita. La confirmación sigue siendo obligatoria: proactividad no equivale a autoridad.
10. Para una semana, distribuye primero obligaciones fijas y después trabajo profundo, llamadas y tareas pequeñas.

Salida: plan legible, con horas solo cuando aporten valor. Si el relato ya contiene compromisos claros, acompaña el plan con sus propuestas canónicas; no obligues a Gari a repetir la orden.
$skill$,
  version = 2,
  updated_at = now()
where slug = 'organizar-dia';
