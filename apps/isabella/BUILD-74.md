# Build 74 — Personal Operating Model v0.1

Fecha de cierre: 3 de octubre de 2026.

## Propósito

Build 74 permite que Isabella aprenda progresivamente **cómo conviene trabajar contigo** sin convertir conducta observada en personalidad, identidad o preferencia aceptada de forma implícita.

El modelo es operacional y revisable. Su cadena epistemológica es:

```
observación
→ evidencia
→ hipótesis
→ propuesta
→ revisión explícita
→ regla aceptada o corregida
```

Solo la última capa puede entrar en el contexto operativo normal de Isabella.

Una observación no es una preferencia. Una hipótesis no es una regla. Una propuesta no modifica comportamiento. Una corrección del usuario sustituye la formulación propuesta y queda trazable. Una regla aceptada o corregida puede retirarse posteriormente sin borrar su historia.

## Contrato canónico

Durante el desarrollo existió un primer esquema provisional `minds_operating_*`. Ese esquema fue consolidado antes del cierre y **ya no existe en producción**.

La única ontología activa es:

- `minds_operating_model_observations`
- `minds_operating_model_evidence`
- `minds_operating_model_hypotheses`
- `minds_operating_model_reviews`
- `minds_model_claim_reviews`

Los tests de Build 74 fallan si reaparece en producción o en el runtime una dependencia de las tablas provisionales eliminadas.

## Observaciones

`minds_operating_model_observations` conserva señales con provenance, no conclusiones sobre la persona.

Dimensiones canónicas:

- `scheduling`
- `task_management`
- `work_rhythm`
- `interruptions`
- `planning`
- `decision_style`
- `communication`
- `tooling`
- `review`

Tipos de señal:

- `explicit_statement`
- `conversation_inference`
- `proposal_outcome`
- `confirmed_correction`
- `manual_correction`
- `pattern_summary`

Fuentes:

- `conversation`
- `shadow_decision`
- `proposal_feedback`
- `outcome_feedback`
- `manual`
- `system`

Una señal explícita conserva ese carácter. Los agregados de actividad, feedback o outcomes siguen siendo observaciones y no se reinterpretan automáticamente como preferencias.

## Evidencia

`minds_operating_model_evidence` enlaza una hypothesis con las observaciones que la sustentan y conserva una stance:

- `supports`
- `contradicts`
- `context`

El vínculo tiene integridad por usuario. Una hypothesis no puede utilizar como evidencia observaciones de otra cuenta.

## Generación de hypotheses

La Edge Function `isabella-operating-model` es el único refresh automático de v0.1.

Tras la reconciliación final, opera exclusivamente sobre las tablas `minds_operating_model_*`.

Puede observar fuentes permitidas, construir señales y proponer hasta dos hypotheses nuevas por refresh. No puede aceptarlas.

Una dimensión es elegible cuando:

- existe al menos una observación explícita; o
- existen al menos dos observaciones de al menos dos source kinds distintos.

Por tanto una señal conductual aislada no basta.

El generador recibe instrucciones explícitas para:

- producir reglas de colaboración operativa;
- no producir etiquetas de personalidad;
- no inferir salud, política, religión, sexualidad, finanzas, ubicación exacta, identidad, motivos ni emociones;
- usar solo las observaciones suministradas;
- preferir no proponer nada a formular una hypothesis débil;
- conservar la evidence dentro de la misma dimensión.

Las hypotheses automáticas nacen siempre en `proposed` y con `requires_explicit_review=true`.

El generador no contiene ninguna ruta que inserte una hypothesis como `accepted`.

## Estados

El contrato consolidado usa:

```
proposed
  ├─ accepted
  ├─ rejected
  └─ superseded   ← regla corregida explícitamente

accepted / superseded
  ↓
stale             ← retirada
```

`superseded` no significa que la regla haya dejado de estar activa: representa que la formulación original fue sustituida por una corrección explícita del usuario. La regla activa vive en el `isabella_model_claims` confirmado enlazado mediante `accepted_claim_id`.

Al retirar una regla aceptada o corregida, ese claim confirmado pasa a `stale` y la hypothesis deja de formar parte de la proyección activa.

## Una regla activa por dimensión

El índice parcial:

`minds_operating_model_one_active_dimension_idx`

permite una sola hypothesis activa por usuario y dimensión entre:

- `proposed`
- `accepted`
- `superseded`

Una nueva hypothesis de la misma dimensión solo puede aparecer cuando la anterior ha sido rechazada o retirada.

Esto evita reglas simultáneas contradictorias sobre la misma dimensión.

## Revisión explícita

La revisión requiere:

- sesión autenticada;
- ownership del usuario;
- `p_confirmed=true`;
- `request_id` explícito;
- decisión explícita.

Decisiones canónicas:

- `accept`
- `reject`
- `replace`
- `retire`

La compatibilidad con la Human Surface conserva el nombre anterior `correct`; el wrapper público lo traduce a `replace`.

### Accept

La hypothesis propuesta se convierte en una regla confirmada y crea o reutiliza un `isabella_model_claims` confirmado.

### Replace / Correct

La formulación proporcionada por el usuario se convierte en el claim confirmado. La hypothesis original queda como `superseded`, preservando provenance y la revisión.

La proyección `accepted` expone la formulación corregida, no la original.

### Reject

La propuesta queda `rejected` y nunca entra en el contexto operativo de Isabella.

### Retire

Puede aplicarse tanto a una hypothesis `accepted` como a una regla corregida `superseded`.

El claim confirmado asociado pasa a `stale`; la hypothesis pasa a `stale`; la dimensión queda libre para futuras propuestas.

## Review receipts

Las revisiones de hypotheses viven en `minds_operating_model_reviews`.

La tabla permite múltiples receipts históricos para la misma hypothesis. Esto es necesario porque una regla puede tener, por ejemplo:

```
replace
→ retire
```

La idempotencia se conserva mediante `UNIQUE(user_id, request_id)`, no mediante unicidad por hypothesis.

Las revisiones de `isabella_model_claims` tienen su ledger separado:

`minds_model_claim_reviews`.

Una corrección o contradicción de un claim personal también conserva un receipt durable.

## Frontera de privilegios

Las tablas del modelo tienen RLS y los usuarios autenticados reciben solo lectura propia. No tienen INSERT/UPDATE/DELETE directo para fabricar el modelo.

Las operaciones de review requieren mutaciones privilegiadas, pero esa lógica **no vive en el schema público**.

Build 74 final usa:

```
public SECURITY INVOKER wrapper
        ↓
minds_private SECURITY DEFINER
        ↓
auth.uid ownership
+ explicit confirmation
+ request id
+ integrity checks
```

Las funciones privadas son:

- `minds_private.review_operating_model_hypothesis`
- `minds_private.review_model_claim`

Los wrappers públicos son:

- `minds_review_operating_model_hypothesis`
- `minds_review_operating_hypothesis` — compatibilidad de Human Surface
- `minds_review_model_claim`

`anon` no tiene EXECUTE sobre los wrappers de review.

Después de este hardening, Supabase Security Advisor no reporta findings para los dos RPCs de review de Build 74.

## Proyección hacia Isabella

`minds_get_personal_operating_model()` devuelve:

- `confirmed_claims`
- `accepted`
- `accepted_hypotheses`
- `proposed`
- `recent_reviews`
- `observation_count`

La colección `accepted` es deliberadamente estrecha. Incluye únicamente hypotheses `accepted` o `superseded` cuyo `accepted_claim_id` apunta a un claim que sigue `confirmed`.

El frontend construye:

`window.ISABELLA_OPERATING_RULES`

solo desde esa colección `accepted`.

`ai.js` envía únicamente esas reglas como:

`preferences.operating_rules`.

`isabella-chat` establece explícitamente:

> Las hipótesis no aceptadas nunca se envían aquí y no deben influir en tu comportamiento.

También prohíbe convertir reglas operativas en etiquetas de personalidad o extrapolar motivos y rasgos fuera de su formulación.

Por tanto:

```
proposed hypothesis
      ✕
normal Isabella context

accepted / explicitly corrected rule
      ↓
relevant operating context
```

## Human Surface

No existe una pestaña nueva.

La superficie continúa en:

**Más → Lo que Isabella sabe de mí → Cómo trabajo**

Muestra:

### Reglas confirmadas

- formulación activa;
- dimensión;
- acción `Retirar`.

### Por revisar

- statement;
- dimensión;
- rationale;
- evidence visible;
- `Sí, úsalo`;
- `Corregir`;
- `No`.

Las dimensiones consolidadas se traducen a lenguaje humano en la UI:

- scheduling → Planificación del tiempo
- task_management → Tareas
- work_rhythm → Ritmo de trabajo
- interruptions → Interrupciones
- planning → Planificación
- decision_style → Decisiones
- communication → Cómo colaboramos
- tooling → Herramientas
- review → Revisión

## Relación con Build 73

Outcome Learning puede crear evidencia factual para el modelo operativo.

Pero la cadena no se colapsa:

```
corrección causal confirmada
→ observación
→ evidence
→ hypothesis
→ proposal
→ review humana
→ regla operativa
```

Una corrección posterior a una acción autónoma no se convierte automáticamente en una preferencia ni en una regla.

## Refresh

El frontend puede solicitar refresh de `isabella-operating-model` como máximo una vez cada 24 horas por usuario en la ruta normal.

El refresh puede:

- capturar observaciones permitidas;
- agregar evidence;
- generar proposals.

No puede:

- aceptar;
- corregir;
- rechazar;
- retirar;
- modificar permisos;
- escribir una regla activa sin revisión.

## Reconciliación del cierre

El desarrollo de Build 74 ocurrió en dos capas.

PR #14 incorporó el primer contrato y la Human Surface. Después, producción recibió una consolidación adicional que reemplazó las tablas provisionales por `minds_operating_model_*`.

El cierre final recupera en GitHub, con las versiones exactas de producción, las migraciones:

- `20261003090435_personal_operating_model_v01`
- `20261003090656_personal_operating_model_v012_consolidate`
- `20261003090953_personal_operating_model_v013_review_hardening`
- `20261003091317_personal_operating_model_v014_retire`
- `20261003092245_personal_operating_model_v015_review_receipts`
- `20261003092332_personal_operating_model_v015_reconcile`
- `20261003093343_personal_operating_model_v016_private_review_boundary`

La reconciliación también actualiza `isabella-operating-model` para que utilice exclusivamente la ontología consolidada y mantiene `isabella-chat` intacto porque su versión de producción ya coincide byte por byte con `main` y contiene la regla accepted-only.

## Validación final

El contrato SQL completo se ejecutó contra producción dentro de `ROLLBACK`.

Verificó:

- una proposal no aparece en `accepted`;
- `p_confirmed=true` es obligatorio;
- authenticated no puede insertar directamente observations, hypotheses ni reviews;
- una corrección explícita se convierte en la regla activa proyectada;
- la formulación original no sustituye a la corrección;
- una segunda regla activa de la misma dimensión queda bloqueada;
- una regla corregida puede retirarse;
- retire libera la dimensión;
- dos review receipts sobre la misma hypothesis quedan preservados;
- las tablas provisionales `minds_operating_*` ya no existen.

Resultado:

`PASS: consolidated model, explicit review, corrected accepted-only projection, durable receipts, retire and one active rule per dimension`

El hardening de wrappers también se probó en `ROLLBACK` bajo rol `authenticated`.

Después de aplicarlo, el mismo contrato volvió a pasar y Security Advisor dejó de señalar:

- `minds_review_operating_model_hypothesis`
- `minds_review_model_claim`

Los avisos de performance que quedan sobre índices recién creados son `unused_index` informativos y esperables mientras las tablas continúen sin tráfico real.

## Estado real del usuario al cierre

La cuenta real permanece con:

- 0 operating-model observations;
- 0 operating-model hypotheses;
- 0 proposed rules;
- 0 accepted rules;
- 0 operating-model reviews.

Por tanto, ninguna hipótesis ni regla fue creada silenciosamente durante la construcción o reconciliación de Build 74.

## Decisión

**Personal Operating Model v0.1 queda adoptado.**

La regla central de Build 74 es:

> Isabella puede observar cómo trabajáis juntos y formular hipótesis operativas, pero solo una regla revisada y aceptada o corregida explícitamente puede cambiar cómo trabaja contigo.

El modelo no intenta describir quién eres.

Su función es permitir que Isabella aprenda, de forma visible y reversible, **cómo colaborar mejor contigo**.

El siguiente build de la hoja de ruta es Build 75 — Counterfactual Isabella v0.1. Su backend ya presenta migraciones en producción, pero queda fuera de este cierre y debe revisarse como un build independiente antes de avanzar.
