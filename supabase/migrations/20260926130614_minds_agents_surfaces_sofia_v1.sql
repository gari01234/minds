
alter table public.conversations drop constraint if exists conversations_app_scope_check;
alter table public.conversations add constraint conversations_app_scope_check
  check (app_scope = any (array['theory'::text,'isabella'::text,'sofia'::text]));

create table if not exists public.sofia_skills (
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
alter table public.sofia_skills enable row level security;
drop policy if exists "sofia_skills_authenticated_read" on public.sofia_skills;
create policy "sofia_skills_authenticated_read" on public.sofia_skills
  for select to authenticated using (enabled = true);

create table if not exists public.sofia_skill_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_slug text not null references public.sofia_skills(slug) on delete cascade,
  skill_version integer not null,
  conversation_id text,
  trigger_message text,
  created_at timestamptz not null default now()
);
alter table public.sofia_skill_runs enable row level security;
drop policy if exists "sofia_skill_runs_own" on public.sofia_skill_runs;
create policy "sofia_skill_runs_own" on public.sofia_skill_runs
  for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists sofia_skill_runs_user_created_idx
  on public.sofia_skill_runs(user_id,created_at desc);

create table if not exists public.minds_surface_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('feed','idea')),
  agent text not null check (agent in ('isabella','sofia')),
  title text not null,
  body text not null default '',
  action_prompt text,
  icon text,
  status text not null default 'active' check (status in ('active','dismissed','saved')),
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table public.minds_surface_items enable row level security;
drop policy if exists "minds_surface_items_own" on public.minds_surface_items;
create policy "minds_surface_items_own" on public.minds_surface_items
  for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists minds_surface_items_user_surface_idx
  on public.minds_surface_items(user_id,surface,status,generated_at desc);

insert into public.sofia_skills (slug,name,description,instructions,preferred_tools,version,enabled)
values
('exegesis',
'Exégesis rigurosa',
'Reconstruye el argumento de un autor o texto sin contaminarlo con la teoría propia del usuario.',
$skill$
Activa un Exegesis Firewall. Reconstruye primero lo que el autor afirma explícitamente, después lo que se desprende razonablemente y solo al final separa posibles interpretaciones. No introduzcas automáticamente la teoría propia del usuario. Distingue tipo y calidad de fuente. Desarrolla problema, premisas, distinciones, secuencia argumental y conclusión. Si falta evidencia textual, dilo.
$skill$,array['search_theory_memory'],1,true),
('analyze-highlights',
'Analizar subrayados',
'Analiza patrones, recurrencias y tensiones en los subrayados y notas recientes del usuario.',
$skill$
Lee los highlights y notas como memoria vivida, no como resumen del texto. Busca recurrencias, cambios de criterio, términos que reaparecen, preguntas no resueltas y diferencias entre lo que el usuario subraya y lo que comenta. No conviertas un patrón en tesis aceptada. Formula descubrimientos como hipótesis discutibles y cita los fragmentos o lecturas que los originan.
$skill$,array['search_theory_memory'],1,true),
('compare-authors',
'Comparar autores',
'Compara autores o textos solo cuando existe una relación conceptual sólida y precisa.',
$skill$
Compara operaciones, premisas, objetivos y consecuencias; evita similitudes meramente estilísticas. Mantén separadas la exégesis de cada autor y la comparación posterior. Indica el nivel exacto de semejanza o diferencia. No fuerces autores a la plantilla teórica del usuario.
$skill$,array['search_theory_memory'],1,true),
('detect-tensions',
'Detectar tensiones',
'Busca contradicciones, fricciones, lagunas y deuda epistemológica en la teoría en evolución.',
$skill$
Busca afirmaciones que no pueden sostenerse simultáneamente, conceptos usados con funciones distintas, saltos causales sin evidencia y preguntas que reaparecen sin resolverse. Diferencia contradicción real de simple cambio de énfasis. Formula la tensión y qué evidencia o lectura ayudaría a resolverla.
$skill$,array['search_theory_memory'],1,true),
('trace-evolution',
'Rastrear evolución de una idea',
'Reconstruye cómo una idea del usuario cambió con lecturas, feedback y conversaciones a lo largo del tiempo.',
$skill$
Reconstruye una cronología intelectual: formulación inicial, lecturas que la modificaron, correcciones del usuario, versiones posteriores y estado actual. Preserva formulaciones antiguas sin presentarlas como vigentes. Señala qué causó cada cambio cuando la procedencia sea recuperable.
$skill$,array['search_theory_memory'],1,true),
('propose-connection',
'Proponer una conexión',
'Propone conexiones nuevas entre lecturas, subrayados o hilos sin convertirlas silenciosamente en convicciones.',
$skill$
Solo propone conexiones cuando existan anclajes claros en el corpus vivido. Explica por qué la conexión merece atención, qué la limita y qué la pondría a prueba. Etiquétala como hipótesis o posibilidad. Nunca la promociones automáticamente a tesis aceptada.
$skill$,array['search_theory_memory','web_search'],1,true),
('reading-next-step',
'Siguiente lectura',
'Propone qué convendría leer o releer después en función de preguntas abiertas y deuda epistemológica.',
$skill$
Parte de preguntas realmente abiertas del corpus. Distingue relectura interna de expansión externa. Si recomiendas una fuente externa, explica qué pregunta concreta ayudaría a poner a prueba y deja claro que todavía no forma parte de la memoria leída.
$skill$,array['search_theory_memory','web_search'],1,true)
on conflict (slug) do update set
 name=excluded.name,description=excluded.description,instructions=excluded.instructions,
 preferred_tools=excluded.preferred_tools,version=excluded.version,enabled=excluded.enabled,updated_at=now();
