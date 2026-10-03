# Build 75 — Counterfactual Isabella v0.1

Fecha: 3 de octubre de 2026.

## Problema

Contextual Autonomy puede llegar a proponer un permiso exacto cuando existe evidencia suficiente. Antes de concederlo, el usuario necesita una pregunta distinta a la elegibilidad:

**¿qué habría ocurrido si este permiso concreto hubiera estado activo durante mi propia historia reciente?**

Build 75 responde con una simulación retrospectiva determinista.

No predice el futuro.

No calcula una probabilidad.

No produce un score.

No ejecuta acciones.

No concede ni revoca permisos.

## Alcance v0.1

La simulación se limita a la única clase de autonomía ya soportada por producción:

- `create_task`;
- contexto `fast_task_undated_v1` o `fast_task_dated_v1`;
- scope exacto `action + context_key + scope_key`;
- últimos 30 días.

Se reutilizan únicamente decisiones ya registradas en `minds_shadow_decisions`.

No se introduce una tabla nueva.

No se crea un modelo de simulación.

## Pregunta contrafactual

La RPC:

`minds_preview_contextual_counterfactual(action, context_key, scope_key)`

supone únicamente que el permiso exacto `allow` hubiera estado activo para cada request histórico de esa misma clase.

Mantiene fijo el request ya clasificado por el servidor.

La simulación cambia solo la capa de confirmación humana.

No intenta reconstruir versiones históricas de políticas globales que no estén versionadas.

## Resultado por caso

Cada observación se clasifica mediante el resultado humano real:

### accepted unchanged

```
confirmación real
→ usuario aceptó sin cambios

counterfactual
→ Isabella habría ejecutado el mismo candidato
→ una confirmación menos
```

Resultado:

`same_result_without_confirmation`

### edited

```
confirmación real
→ usuario corrigió antes de aceptar

counterfactual
→ Isabella habría ejecutado el candidato original
→ la corrección habría ocurrido después
```

Resultado:

`would_act_before_correction`

### rejected

```
confirmación real
→ usuario rechazó

counterfactual
→ Isabella habría actuado antes de ese rechazo
```

Resultado:

`would_act_despite_rejection`

### executed

La acción ya ocurrió bajo un permiso real.

No se presenta como contrafactual.

Resultado:

`already_autonomous`

### pending / expired

No existe una decisión humana final.

Build 75 no la inventa.

Resultado:

`unknown`

Si `reviewed_candidate` es nulo, `changed_fields=[]`. Un request sin revisión no se presenta falsamente como edición.

## Summary explicable

La RPC devuelve contadores separados:

- observed_cases;
- historical_reviews;
- would_have_auto_executed;
- would_have_matched_final;
- would_have_preceded_correction;
- would_have_preceded_rejection;
- already_autonomous;
- unknown_outcome.

No se combinan en una puntuación.

MINDS no transforma:

`12 coincidencias / 0 correcciones`

en:

`confidence = 0.94`

El usuario ve los hechos.

## Human Surface

Build 75 vive dentro de:

**Más → Permisos de Isabella**

Las unidades compatibles muestran:

**Ver qué habría pasado**

La simulación abre una vista separada de la autorización.

Muestra:

- número de revisiones históricas comparables;
- cuántas habrían producido exactamente el mismo resultado;
- cuántas habrían ejecutado antes de una corrección;
- cuántas habrían ejecutado algo posteriormente rechazado;
- cuántas no tienen resultado humano conocido;
- hasta 12 casos concretos con fecha, título y campos corregidos.

La vista dice explícitamente:

> Simulación, no permiso.

No contiene ningún botón de autorización.

Para conceder un permiso el usuario debe volver a la pantalla normal y usar el flujo existente de Contextual Autonomy.

## Seguridad y autoridad

La función usa `SECURITY INVOKER`.

Por tanto, las lecturas siguen el RLS existente del usuario autenticado.

La RPC:

- exige identidad autenticada;
- exige action/context/scope exactos;
- limita v0.1 a las clases fast-task permitidas;
- lee únicamente registros propios;
- no escribe tablas;
- no llama `minds_try_contextual_task`;
- no modifica `minds_contextual_permissions`;
- no crea permission reviews;
- no crea autonomy executions;
- no crea evidencia nueva.

El contrato SQL comprueba los recuentos de:

- Shadow decisions;
- tasks;
- contextual permissions;
- permission reviews;
- autonomy executions

antes y después de la simulación y exige que sean idénticos.

## Validación

La función se probó primero dentro de una transacción con rollback antes de aplicarse.

Fixture:

- un request aceptado sin cambios;
- un request editado;
- un request rechazado.

Resultado esperado y observado:

- historical_reviews = 3;
- matched final = 1;
- preceded correction = 1;
- preceded rejection = 1;
- cero side effects.

Después se aplicó a producción y se repitió un contrato sintético completo con rollback.

La primera simulación real sobre la cuenta del usuario encontró una unidad fast-task con un request todavía pendiente.

El resultado fue:

- observed_cases = 1;
- historical_reviews = 0;
- unknown_outcome = 1;
- changed_fields = [];
- no permission existente.

Esto es correcto: MINDS no infiere cómo habría respondido el usuario.

Supabase Security Advisor y Performance Advisor no reportan findings nuevos vinculados a la RPC de Build 75.

## Migraciones

- `20261003091752_counterfactual_isabella_v01`
- `20261003091841_counterfactual_isabella_v011_pending_hardening`

## Decisión

**Counterfactual Isabella v0.1 queda adoptado.**

Su función no es recomendar al usuario si debe autorizar.

Su función es convertir una decisión abstracta de autonomía en evidencia autobiográfica concreta:

```
si hubieras concedido este permiso
→ éstos son los casos reales que habrían cambiado
```

La decisión sigue siendo humana.

El siguiente build previsto es:

**Build 76 — Expectation Engine v0.1.**
