# Build 74 — Personal Operating Model v0.1

Fecha: 3 de octubre de 2026.

## Problema

Build 73 cerró un bucle estrecho de Outcome Learning: Isabella puede detectar una posible corrección después de una acción autónoma, pero solo el usuario puede confirmar que esa consecuencia fue realmente causal.

Build 74 aborda una pregunta distinta:

**¿cómo puede Isabella aprender progresivamente cómo conviene organizarse contigo sin convertir observaciones conductuales en rasgos, preferencias o reglas aceptadas de forma implícita?**

La respuesta es un Personal Operating Model explícito y revisable.

No es un perfil psicológico.

No intenta describir quién es el usuario.

Modela únicamente reglas operativas sobre:

- planificación del tiempo;
- tareas;
- concentración;
- interrupciones;
- decisiones;
- autonomía;
- interacción.

## Cadena epistemológica

Build 74 conserva separadas cinco capas:

```
observación
    ↓
evidencia
    ↓
hipótesis
    ↓
propuesta
    ↓
aceptación / corrección / rechazo
```

Solo la última capa puede afectar el comportamiento normal de Isabella.

Una observación no es una preferencia.

Una hipótesis no es una regla.

Una propuesta no es una convicción aceptada.

## Datos

### minds_operating_observations

Registra evidencia estructurada con provenance.

Dimensiones:

- `time_planning`;
- `task_management`;
- `focus`;
- `interruption`;
- `decision_making`;
- `autonomy`;
- `interaction`.

Provenance:

- `explicit`;
- `behavioral`;
- `outcome`;
- `system`.

Fuentes v0.1:

- agregados de actividad;
- snapshots permitidos por el contrato;
- preferencias explícitas del asistente;
- revisiones de permisos;
- Outcome Learning confirmado;
- feedback de propuestas.

La observación conserva `source_type`, `source_ref`, ventana temporal y datos estructurados.

## Generación de hipótesis

La Edge Function:

`isabella-operating-model`

se ejecuta bajo sesión autenticada.

Recupera únicamente fuentes permitidas y crea observaciones factuales.

El modelo generador recibe instrucciones explícitas:

- producir reglas operativas, no etiquetas de personalidad;
- no inferir salud, política, religión, sexualidad, finanzas, ubicación exacta, identidad, motivos ni emociones;
- usar únicamente las observaciones suministradas;
- preferir no proponer nada antes que una hipótesis débil;
- mantener cada evidence ID dentro de la misma dimensión.

Una dimensión puede ser elegible para hipótesis cuando:

- existe evidencia explícita; o
- existen al menos dos observaciones de al menos dos source types distintos.

La evidencia conductual aislada no basta.

## Estado de una hipótesis

```
hypothesis
    ↓
proposed
   ├─ accepted
   └─ rejected

accepted
    ↓
retired
```

El backend puede crear `hypothesis` y publicarla como `proposed`.

El usuario autenticado no tiene INSERT directo sobre:

- observations;
- hypotheses;
- reviews.

Por tanto, el usuario tampoco puede fabricar directamente el modelo desde el cliente.

## Una regla activa por dimensión

Build 74.0.1 añade un índice parcial único:

`minds_operating_one_active_dimension_idx`

Solo puede existir una regla `proposed` o `accepted` por usuario y dimensión.

Esto evita acumulaciones contradictorias del tipo:

```
interaction:
  regla A accepted
  regla B proposed
  regla C proposed
```

Una nueva regla sobre la misma dimensión solo puede avanzar después de rechazar o retirar la anterior.

## Revisión explícita

El RPC público:

`minds_review_operating_hypothesis`

usa `SECURITY INVOKER` y delega la operación privilegiada a:

`minds_private.review_operating_hypothesis`.

La revisión exige:

- usuario autenticado;
- hypothesis propia;
- request ID;
- `p_confirmed=true`;
- decisión explícita.

Decisiones:

- `accept`;
- `correct`;
- `reject`;
- `retire`.

### Accept

La formulación original pasa a `accepted_statement`.

### Correct

La formulación corregida por el usuario se convierte en la regla aceptada.

La hipótesis original y la revisión permanecen trazables.

### Reject

La propuesta deja de estar activa.

No influye en Isabella.

### Retire

Una regla anteriormente aceptada deja de utilizarse.

La historia no se destruye.

## Review receipts

Cada decisión crea un receipt en:

`minds_operating_reviews`.

Conserva:

- hypothesis;
- request ID;
- decisión;
- status antes y después;
- formulación original;
- formulación final.

Los receipts son históricos y no sustituyen la regla aceptada.

## Human Surface

Build 74 no crea una pestaña nueva.

La revisión vive en:

**Más → Lo que Isabella sabe de mí → Cómo trabajo**

La superficie muestra:

### Propuestas

Cada propuesta incluye:

- formulación;
- dimensión;
- rationale;
- evidencia visible.

Acciones:

- Confirmar;
- Corregir;
- Rechazar.

### Reglas confirmadas

Muestran la formulación aceptada y la dimensión.

Acción:

- Retirar.

Esto mantiene la diferencia entre:

`Modelo personal`

y:

`Cómo trabajo`.

El primero contiene claims personales existentes del sistema.

El segundo contiene reglas operativas explícitas.

## Uso por Isabella

`minds_get_personal_operating_model()` devuelve por separado:

- accepted;
- proposed;
- recent reviews;
- observation count.

El frontend construye:

`window.ISABELLA_OPERATING_RULES`

**únicamente** desde `accepted`.

El contexto enviado a Isabella contiene:

`preferences.operating_rules`

solo con reglas aceptadas o corregidas explícitamente.

La instrucción del runtime establece:

> Las hipótesis no aceptadas nunca se envían aquí y no deben influir en tu comportamiento.

Además:

- las reglas solo se aplican cuando son pertinentes;
- no se convierten en etiquetas de personalidad;
- no se extrapolan motivos, rasgos ni preferencias fuera de su formulación.

## Refresh

Después de una sincronización normal, Isabella puede refrescar el Personal Operating Model como máximo una vez cada 24 horas por usuario en el cliente.

Ese refresh puede:

- crear nuevas observaciones;
- generar hypotheses;
- publicar proposals.

No puede:

- aceptar una regla;
- corregirla;
- rechazarla en nombre del usuario;
- retirar una regla aceptada;
- convertir una hypothesis en memoria.

Por tanto:

```
observación automática
→ propuesta posible
→ revisión humana obligatoria
```

## Relación con Build 73

Outcome Learning confirmado puede convertirse en una fuente de observación con provenance `outcome`.

Pero Build 74 no copia automáticamente una corrección causal a una regla operativa.

La corrección puede contribuir como evidencia.

Después todavía debe existir:

```
evidencia
→ hypothesis
→ proposal
→ review
```

## Seguridad

Las tres tablas tienen RLS.

`authenticated` recibe solo SELECT propio.

No existen INSERT/UPDATE/DELETE directos del cliente sobre el modelo.

El review público es `SECURITY INVOKER`.

La mutación privilegiada vive en schema privado y exige `auth.uid()` y confirmación explícita.

Supabase Security Advisor no reporta findings vinculados a las tablas/RPCs de Build 74.

El único aviso de performance específico observado tras el despliegue es un índice todavía no usado en `minds_operating_reviews`, esperado mientras las tablas estén vacías.

## Estado de datos al cierre

Antes de fusionar Build 74 se comprobó la cuenta real:

- 0 operating observations;
- 0 operating reviews;
- 0 hypotheses activas.

Aunque las migraciones y la Edge Function ya se habían desplegado durante el desarrollo, ninguna regla había sido inferida o aceptada silenciosamente.

## Validación

Se ejecutó un contrato sintético completo con `ROLLBACK` sobre producción.

Se verificó:

- hypothesis propuesta no aparece en accepted;
- propuesta sí aparece para review;
- review sin `p_confirmed=true` falla;
- corrección explícita crea accepted_statement corregido;
- proposed queda vacío tras aceptación;
- authenticated no puede insertar observations/hypotheses/reviews;
- no pueden existir dos reglas activas de la misma dimensión;
- retire libera la dimensión;
- una nueva hypothesis puede proponerse después;
- review receipts quedan preservados.

Además se verificó que:

- `isabella-operating-model` en producción coincide con la rama;
- `isabella-chat` de la rama añade la instrucción accepted-only que faltaba en el deploy intermedio;
- solo `window.ISABELLA_OPERATING_RULES` construida desde accepted entra en el contexto normal de Isabella.

## Decisión

**Personal Operating Model v0.1 queda adoptado.**

La regla central es:

> Isabella puede observar patrones de trabajo y formular hipótesis operativas, pero solo una regla revisada y aceptada explícitamente puede cambiar cómo trabaja contigo.

Build 74 implementa:

```
observación
→ evidencia
→ hipótesis
→ propuesta
→ aceptación
→ regla operativa
```

sin entrenamiento implícito y sin convertir comportamiento en identidad.

El siguiente build previsto sigue siendo:

**Build 75 — Counterfactual Isabella v0.1.**
