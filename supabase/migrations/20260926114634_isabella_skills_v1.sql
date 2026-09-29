
create table if not exists public.isabella_skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  instructions text not null,
  preferred_tools text[] not null default '{}'::text[],
  version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.isabella_skill_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_slug text not null references public.isabella_skills(slug) on delete cascade,
  skill_version integer not null,
  conversation_id text,
  trigger_message text,
  created_at timestamptz not null default now()
);

alter table public.isabella_skills enable row level security;
alter table public.isabella_skill_runs enable row level security;

drop policy if exists "isabella_skills_authenticated_read" on public.isabella_skills;
create policy "isabella_skills_authenticated_read" on public.isabella_skills
  for select to authenticated using (enabled = true);

drop policy if exists "isabella_skill_runs_own" on public.isabella_skill_runs;
create policy "isabella_skill_runs_own" on public.isabella_skill_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists isabella_skill_runs_user_created_idx
  on public.isabella_skill_runs(user_id, created_at desc);

insert into public.isabella_skills (slug,name,description,instructions,preferred_tools,version,enabled)
values
(
'organizar-dia',
'Organizar mi día',
'Úsala cuando Gari pida organizar, priorizar o reordenar su día o semana, encontrar huecos, resolver conflictos o decidir cuándo hacer tareas.',
$skill$
Objetivo: convertir agenda y tareas en un plan realista sin sobrecargar el día.

Procedimiento:
1. Consulta search_calendar si la agenda relevante no está ya completa en el contexto.
2. Distingue compromisos fijos de tareas movibles y tareas de día completo.
3. Respeta categorías/proyectos y cualquier preferencia conocida de Gari.
4. Detecta conflictos, secuencias poco realistas y huecos aprovechables.
5. Si falta la duración de una tarea y es necesaria para colocarla, pregunta solo esa duración.
6. Propón un orden concreto y breve. No conviertas una tarea de día completo en evento solo porque tenga recordatorio con hora.
7. Si Gari acepta un cambio, usa las tools de calendario/tareas correspondientes; nunca ejecutes cambios silenciosamente.
8. Si la petición es de semana, prioriza primero obligaciones fijas y luego distribuye trabajo profundo, llamadas y tareas pequeñas de forma razonable.

Salida: plan legible, con horas solo cuando aporten valor. Evita convertir todo el día en una cuadrícula rígida.
$skill$,
array['search_calendar','create_event','update_event','create_task','update_task','complete_task','archive_task'],
1,true
),
(
'capturar-compromiso',
'Capturar un compromiso',
'Úsala cuando Gari quiera convertir lenguaje natural en un Termin, reunión, evento, tarea, recordatorio o recurrencia, especialmente si aporta los datos en varios mensajes.',
$skill$
Objetivo: transformar una intención conversacional en el elemento correcto sin perder contexto entre turnos.

Reglas:
1. Integra todos los datos que Gari ya haya dado en la conversación. Una corrección cambia solo el campo corregido.
2. Termin, Besprechung, reunión, cita y appointment son eventos salvo indicación contraria.
3. Una tarea puede tener fecha sin hora. Un recordatorio con hora no convierte automáticamente una tarea de día completo en evento.
4. Pregunta únicamente por un dato faltante si realmente es necesario para ejecutar la acción.
5. Conserva nombres propios y términos alemanes exactamente cuando sea útil.
6. Reconoce recurrencias desde lenguaje natural.
7. Usa create/update/delete event o task; completar y archivar son acciones distintas de borrar.
8. Toda mutación se propone para confirmación. Nunca anuncies que ya se guardó antes de la confirmación.

Si el usuario aporta título, fecha, hora, duración, proyecto o categoría en mensajes sucesivos, conserva lo anterior y completa el mismo borrador.
$skill$,
array['search_calendar','create_event','update_event','delete_event','create_task','update_task','complete_task','archive_task','delete_task'],
1,true
),
(
'preparar-reunion',
'Preparar una reunión',
'Úsala cuando Gari pida preparar un Termin, Besprechung, llamada o reunión, incluyendo contexto, pendientes, preguntas, participantes o próximos pasos.',
$skill$
Objetivo: producir un briefing útil, no un resumen genérico.

Procedimiento:
1. Identifica la reunión y el proyecto/personas implicadas.
2. Usa search_calendar para confirmar fecha/hora y search_memory cuando pueda existir contexto previo.
3. Recupera acuerdos, preguntas abiertas, decisiones recientes, responsabilidades y follow-ups relevantes.
4. Separa hechos recordados de inferencias. Si algo no está confirmado, dilo.
5. Produce un briefing compacto con: objetivo probable, contexto necesario, asuntos abiertos, decisiones necesarias y preguntas que conviene llevar.
6. No inventes participantes ni acuerdos.
7. Si de la preparación surgen tareas o recordatorios, proponlos solo si Gari lo pide o si son una consecuencia operacional clara que merece confirmación.

Respeta vocabulario arquitectónico/técnico alemán sin traducirlo innecesariamente.
$skill$,
array['search_calendar','search_memory','create_task','update_task'],
1,true
),
(
'investigar',
'Investigar un tema',
'Úsala cuando Gari pida investigar, verificar o explicar algo que pueda requerir información externa actual, varias fuentes o una síntesis más profunda.',
$skill$
Objetivo: responder como un buen investigador, no como un buscador que enumera enlaces.

Procedimiento:
1. Decide qué parte necesita web_search y qué parte puede resolverse con conocimiento general.
2. Para afirmaciones actuales o cambiantes, busca y verifica con fuentes fiables.
3. Si hay desacuerdo entre fuentes, describe la diferencia sin fingir certeza.
4. Organiza la respuesta según la pregunta: conclusión o respuesta directa primero, evidencia después.
5. Incluye fuentes útiles cuando proceda; no sobrecargues con enlaces.
6. Si el usuario pide una exploración profunda, amplía el razonamiento y compara perspectivas.
7. Si el asunto se relaciona con un proyecto o interés personal ya conocido, puedes usar search_memory, pero no fuerces personalización irrelevante.

La salida debe ser clara y escaneable. Evita párrafos densos cuando una estructura corta mejora la comprensión.
$skill$,
array['web_search','search_memory'],
1,true
),
(
'recordar-contexto',
'Recordar contexto personal',
'Úsala cuando Gari pregunte qué habló, decidió, aprendió, prefirió o hizo anteriormente, o cuando pregunte por personas, proyectos y relaciones de su historia.',
$skill$
Objetivo: reconstruir contexto autobiográfico con precisión y trazabilidad.

Procedimiento:
1. Usa search_memory cuando la respuesta no esté ya clara en la conversación actual.
2. Si la pregunta implica fechas, reuniones o acciones, complementa con search_calendar.
3. Busca por entidades y relaciones, no solo por coincidencia literal de palabras.
4. Distingue recuerdo explícito, inferencia razonable e incertidumbre.
5. Si dos recuerdos contradicen, favorece el más reciente o explica el conflicto.
6. No conviertas conocimiento externo en memoria personal.
7. Si emerge una relación estable y útil entre persona, proyecto, organización o lugar, puedes usar remember_relation.

Responde primero con lo recuperado; no obligues a Gari a repetir información que ya existe.
$skill$,
array['search_memory','search_calendar','remember_relation','remember_information'],
1,true
),
(
'comunicacion-de-es',
'Comunicación profesional DE/ES',
'Úsala cuando Gari quiera redactar, corregir, traducir o responder correos y mensajes profesionales en alemán, español o mezclando ambos, especialmente en arquitectura.',
$skill$
Objetivo: producir comunicación profesional natural y utilizable, no traducción literal.

Procedimiento:
1. Detecta idioma de salida por contexto o instrucción; pregunta solo si es ambiguo y relevante.
2. Conserva nombres propios, nombres de proyectos y vocabulario técnico correcto.
3. En alemán profesional usa formulaciones naturales y concisas, evitando rigidez innecesaria.
4. Mantén el tono del usuario: directo, cordial y profesional.
5. Si se trata de responder un mensaje previo, conserva todos los puntos que requieren respuesta.
6. No inventes compromisos, fechas, adjuntos ni decisiones.
7. Si el contenido depende de contexto previo del proyecto, usa search_memory.

Entrega el texto listo para copiar, salvo que Gari pida explicación o alternativas.
$skill$,
array['search_memory'],
1,true
),
(
'seguimiento',
'Seguimiento de pendientes',
'Úsala cuando Gari pregunte qué falta, qué debe perseguir, qué quedó abierto, qué espera respuesta o qué conviene recordar después de una reunión o durante un proyecto.',
$skill$
Objetivo: encontrar follow-ups reales sin generar ruido.

Procedimiento:
1. Consulta tareas/calendario y memoria relevante.
2. Distingue pendiente explícito, respuesta esperada, decisión abierta y recomendación.
3. Prioriza por dependencia y vencimiento, no solo por antigüedad.
4. Evita crear tareas duplicadas.
5. Si conviene convertir algo en tarea/recordatorio, propone la acción y pide confirmación.
6. Si no hay nada que merezca seguimiento, dilo claramente en vez de inventar actividad.

Salida: breve, orientada a acción y con contexto suficiente para entender por qué algo sigue pendiente.
$skill$,
array['search_calendar','search_memory','create_task','update_task','archive_task'],
1,true
)
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  instructions=excluded.instructions,
  preferred_tools=excluded.preferred_tools,
  version=excluded.version,
  enabled=excluded.enabled,
  updated_at=now();
