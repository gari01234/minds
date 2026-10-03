# Build 73 — Outcome Learning / Post-Action Feedback v0.1

Fecha: 3 de octubre de 2026.

## Problema

Build 70 permitió que Isabella ejecutara una clase muy estrecha de acciones sin confirmación inmediata cuando existía un permiso contextual explícito y vigente.

Eso crea una pregunta nueva:

**¿qué ocurre si, después de una acción autónoma, el usuario modifica lo que Isabella hizo?**

La respuesta ingenua sería considerar toda edición posterior como feedback negativo.

Build 73 rechaza esa interpretación.

Una edición posterior puede deberse a:

- una corrección real de Isabella;
- un cambio de planes del usuario;
- nueva información;
- una preferencia circunstancial;
- uso normal del objeto;
- una modificación sin relación causal con la acción original.

Por tanto:

```
edición posterior
    ≠
corrección de Isabella
```

## Principio

Build 73 separa tres capas:

```
acción autónoma
    ↓
mutación posterior compatible
    ↓
feedback candidate
    ↓
revisión explícita del usuario
    ├─ cambio posterior → no causal
    └─ corrección → evidencia causal
```

El candidate representa correlación.

Solo la revisión explícita representa causalidad.

## Alcance v0.1

Outcome Learning se limita a la única clase de acción autónoma actualmente autorizable por Contextual Autonomy:

- creación de tareas sencillas mediante `create_task`.

No se generaliza todavía a eventos, Work, mensajes externos, archivos, Missions ni otros side effects.

## Vínculo causal verificable

Cada ejecución autónoma ya deja un receipt en:

`minds_autonomy_executions`

Ese receipt conserva:

- request;
- permission;
- permission revision;
- task ID;
- candidate original.

La tarea creada lleva:

`client_key = autonomy:<request_id>`

Las mutaciones manuales ya se registran en:

`isabella_activity_log`

Build 73 une ambos registros sin pedir al modelo que infiera la relación.

## Candidate detection

La tabla:

`minds_post_action_feedback_candidates`

solo puede recibir un candidate cuando:

1. la entidad es una tarea;
2. la mutación procede del usuario: `source='manual'`;
3. la acción es `update` o `delete`;
4. la tarea coincide exactamente con un receipt autónomo;
5. la mutación ocurre dentro de las 48 horas posteriores a la ejecución;
6. cambia al menos uno de los campos relevantes;
7. todavía no existe un candidate para esa ejecución.

Campos relevantes v0.1:

- title;
- date;
- categoryId;
- notes;
- deleted.

No producen candidate por sí mismos:

- completar;
- reabrir;
- reordenar;
- archivar;
- restaurar;
- otras operaciones normales sin cambio relevante.

Build 73.0.1 endurece además el criterio de **primera mutación relevante**: completar una tarea no consume la posibilidad de detectar posteriormente una corrección real dentro de la ventana de 48 horas.

## No retroactividad

La migración no analiza el historial anterior.

Solo nuevas entradas de `isabella_activity_log` pasan por el trigger.

En el momento de activación, la cuenta real del usuario tenía:

- 0 post-action candidates;
- 0 outcome feedback receipts.

No se reinterpretaron ediciones históricas.

## Revisión explícita

El RPC:

`minds_review_post_action_feedback`

solo puede ejecutarlo el usuario autenticado.

Requiere:

- candidate propio;
- `p_confirmed=true`;
- outcome explícito:
  - `correction`;
  - `later_change`.

`anon` y `service_role` no pueden afirmar causalidad.

La revisión es idempotente.

Candidates sin revisar caducan después de 14 días.

## Cambio posterior

Si el usuario indica:

`later_change`

el candidate pasa a:

`not_causal`

Consecuencias:

- no se crea `minds_outcome_feedback`;
- no cambia el permiso;
- no modifica memoria;
- no cambia Shadow Agency;
- no se interpreta como señal negativa.

## Corrección confirmada

Si el usuario indica:

`correction`

el candidate pasa a:

`confirmed_correction`

y se crea un receipt inmutable en:

`minds_outcome_feedback`.

Ese receipt conserva:

- execution original;
- permission y revision;
- action/context/scope;
- changed fields;
- before / after state;
- provenance de la revisión explícita.

## Efecto sobre autonomía

Una corrección confirmada puede **reducir** autoridad.

Si el permiso exacto sigue en `allow`:

```
allow
  ↓
confirm
```

Además:

- revision + 1;
- expiry eliminada;
- evidence enlaza el feedback receipt.

Isabella vuelve a pedir confirmación para esa clase de acción.

Build 73 no contiene ninguna ruta que promueva:

`confirm → allow`

a partir de post-action feedback.

## Efecto sobre Contextual Autonomy

`minds_private.contextual_evidence` incorpora ahora correcciones causales confirmadas de los últimos 30 días.

Si existe una:

`eligibility = needs_review`

aunque existan revisiones antiguas sin cambios.

El fingerprint de evidencia también cambia, por lo que una revisión de permiso basada en evidencia anterior no puede reutilizarse silenciosamente.

Tras salir de la ventana de 30 días, una futura autorización sigue exigiendo las reglas normales de evidencia vigentes.

## Lo que Build 73 NO aprende

Build 73 no interpreta como aprendizaje:

- completar una tarea;
- mantener una tarea sin editar;
- una edición después de 48 horas;
- una segunda edición posterior;
- una edición marcada por el usuario como cambio posterior;
- el mero resultado de una acción;
- una inferencia del modelo sobre satisfacción.

Tampoco crea:

- memoria autobiográfica;
- preferencias;
- reglas de personalidad;
- permisos nuevos.

Ese material podrá informar Builds posteriores, pero no se convierte silenciosamente en Personal Operating Model.

## Human Surface

No se añade una nueva sección.

En:

**Más → Permisos de Isabella**

aparece, cuando corresponde:

**Correcciones por revisar**

La pregunta explica que MINDS solo ha detectado una relación temporal y ofrece dos respuestas:

- **Sí, fue una corrección**
- **Fue un cambio posterior**

Antes de confirmar se explica el efecto:

> si fue una corrección, Isabella volverá a pedir confirmación en esa clase de tarea.

El historial diferencia:

- Corrección confirmada;
- Cambio posterior.

## Seguridad

Las dos tablas de 73 tienen RLS y solo lectura propia para authenticated.

No existen INSERT/UPDATE directos desde el cliente.

El trigger privado produce candidates.

El RPC autenticado es la única vía para afirmar causalidad.

El RPC es deliberadamente `SECURITY DEFINER` porque debe actualizar varias tablas sin conceder escrituras directas al cliente. La frontera compensa ese privilegio mediante:

- `auth.uid()`;
- ownership;
- confirmación explícita;
- outcomes cerrados;
- review window;
- row locks;
- idempotencia;
- revocación de EXECUTE para anon y service_role.

## Validación

Antes de aplicar la migración se ejecutó el contrato completo con `ROLLBACK`.

Después de aplicar la migración se repitió sobre el esquema real con `ROLLBACK`.

Se verificó:

- candidate tras primera edición relevante;
- changed field exacto;
- no duplicate candidate;
- completion no es feedback;
- completion no consume una corrección posterior;
- edición >48 h no es candidate;
- `later_change` no crea evidencia ni cambia permiso;
- `correction` crea exactamente un receipt;
- review idempotente;
- permiso exacto pasa de allow a confirm;
- revision avanza;
- Contextual Autonomy pasa a needs_review;
- RLS por usuario;
- no direct writes;
- service role no puede afirmar causalidad.

## Decisión

**Outcome Learning / Post-Action Feedback v0.1 queda adoptado.**

La regla central es:

> Isabella puede aprender de las consecuencias de sus acciones, pero no puede decidir por sí misma qué consecuencia fue una corrección.

Build 73 cierra el bucle:

```
evidencia
→ permiso explícito
→ acción autónoma
→ posible corrección observada
→ causalidad confirmada por el usuario
→ reducción de autonomía
→ nueva evidencia
```

El siguiente build es:

**Build 74 — Personal Operating Model v0.1.**
