-- Build 81 · Skills & Capability Composition v0.1
-- Preserve Skill execution history across system/personal Skills without granting authority.

alter table public.isabella_skill_runs
  add column if not exists skill_source text not null default 'system',
  add column if not exists skill_name text;

update public.isabella_skill_runs r
set skill_name = s.name
from public.isabella_skills s
where r.skill_name is null
  and r.skill_slug = s.slug;

alter table public.isabella_skill_runs
  drop constraint if exists isabella_skill_runs_skill_slug_fkey;

alter table public.isabella_skill_runs
  drop constraint if exists isabella_skill_runs_skill_source_check;

alter table public.isabella_skill_runs
  add constraint isabella_skill_runs_skill_source_check
  check (skill_source in ('system','personal'));

create index if not exists isabella_skill_runs_user_source_slug_created_idx
  on public.isabella_skill_runs(user_id,skill_source,skill_slug,created_at desc);

drop policy if exists "isabella_skill_runs_own" on public.isabella_skill_runs;
create policy "isabella_skill_runs_own" on public.isabella_skill_runs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- Acceptance Skill v2: prove composition with Work + Threads + general execution.
update public.isabella_skills
set
  name = 'Preparar una reunión',
  description = 'Prepara un Termin, Besprechung, llamada o reunión combinando agenda, Work, Threads, documentos y deliverables cuando realmente hagan falta.',
  instructions = $skill$
Objetivo: llegar a la reunión con el contexto correcto, las decisiones visibles y el material utilizable ya preparado, sin convertir conversación o documentos en verdad de proyecto por accidente.

Procedimiento:
1. Identifica reunión, proyecto, fecha/hora y personas solo a partir de evidencia disponible.
2. Consulta search_calendar cuando el contexto temporal no esté ya claro.
3. Si pertenece a Work, usa search_work para recuperar estado estructurado y search_work_threads para localizar conversación relevante. Un Thread no equivale a conocimiento confirmado.
4. Usa read_work_file solo sobre archivos concretos cuyo contenido sea material para preparar la reunión.
5. Distingue hechos confirmados, información de documentos, conversaciones previas, inferencias y preguntas abiertas.
6. Produce un briefing con objetivo, estado actual, asuntos abiertos, decisiones necesarias, responsabilidades/follow-ups y preguntas útiles.
7. Si la finalidad requiere un objeto utilizable —agenda, Teilnehmerliste, protocolo, tabla de seguimiento o material de apoyo— usa execute_artifact_task. No reemplaces un deliverable por instrucciones.
8. Un artifact generado sigue siendo deliverable y no se promueve silenciosamente a verdad de proyecto.
9. Si surgen tareas derivadas, usa create_task/update_task por la vía normal de confirmación.
10. No inventes participantes, acuerdos, plazos ni decisiones. Conserva vocabulario arquitectónico/técnico alemán cuando corresponda.
11. Compón con otra Skill solo cuando aporte un procedimiento distinto y materialmente necesario.
$skill$,
  preferred_tools = array[
    'search_calendar',
    'search_memory',
    'search_work',
    'search_work_threads',
    'read_work_file',
    'search_commitments',
    'execute_artifact_task',
    'create_task',
    'update_task'
  ],
  version = 2,
  enabled = true,
  updated_at = now()
where slug = 'preparar-reunion';
