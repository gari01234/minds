# Romy = Isabella · Fase 5 · Projektakte compartida en Office

Fuente: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, fase 5.

## Semántica de acceso y procedencia

El proyecto `office_projects` es la unidad de autorización de la Projektakte compartida, no el propietario de una conversación individual. Cada operación de lectura debe limitarse a un proyecto del equipo, y RLS de Office sigue verificando `office_project_members` incluso frente a un miembro que sea administrador. Un documento conserva su `user_id` de origen; que una persona del equipo pueda leer sus fragmentos no la convierte en autora del archivo. Los Threads y las conversaciones personales siguen sin compartirse.

El motor conserva `PFLEGE_INSTRUCTIONS`, `trustedPflegeWorkflow` y `runAktePflege` de Window en el perfil por defecto. La rama Office introduce `trustedOfficePflegeWorkflow`, mensajes y análisis en alemán, `collectOfficeAkteSources` (solo PDFs/Word/Excel previamente indexados de un proyecto, segmentos con localizadores verificables) y `officeAkteProposals`. Cada propuesta debe señalar un archivo, una versión, una cita que aparezca literalmente en el texto fuente y, cuando se trate de una Frist, una fecha explícita. El modelo no convierte ese material en una decisión confirmada.

El proceso `runOfficeAktePflege` se limita a proyectos activos con equipo activo. Una reserva diaria de proyecto evita pasadas dobles, con un límite de proyectos y bytes por ejecución. El registro `minds_work_memory` se escribe exclusivamente con `status='proposed'`, `metadata.author_kind='system'`, cita y revisión humana obligatoria; se utiliza como `user_id` técnico el miembro activo de identificador menor para satisfacer el modelo existente, **no como atribución de autoría humana**. Esta compatibilidad queda como decisión abierta de modelado; se recomienda en una migración futura un `system_actor` explícito, tras revisión.

## Docling y archivo de origen

`officeIngestAuthorized` del nuevo `_shared/office-akte-access.mjs` comprueba justo antes de procesar un archivo: proyecto activo, origen del archivo coincidente, miembro activo y pertenencia actual del propietario al proyecto. Ante revocación de equipo, el runner marca el job como bloqueado sin exponer texto ni procesarlo. La función de Work permanece con el mismo nombre y el perfil Window no invoca esta comprobación adicional.

No se copian documentos, registros de equipo, correos ni contenido real de clientes. Las credenciales de Docling permanecen fuera del repositorio; solo figuran los nombres de sus variables. Los documentos de prueba son inventados.

## Verificación y costes

`tests/romy-phase5-akte-office.test.mjs` prueba el filtrado por proyecto con dobles, procedencia exacta de las citas, deduplicación de propuestas y el rechazo de trabajos de un usuario expulsado. Office ejecuta además SQL A/B de acceso por proyecto y bloqueo concurrente sobre PostgreSQL 17 efímero. Las suites de Node/Deno mantienen el perfil de Window. La ruta ordinaria del chat no recibe nuevos bloques de prompt en esta fase (`promptComponentSizes` delta 0); la limpieza documental solo se invoca en un job nocturno acotado, nunca en `work_light`.

## Sin activar, reversión y elección conservadora

Ninguna migración se ha aplicado, ningún ejecutor se ha desplegado, ningún cron de Office corre desde esta rama. La nueva migración de Office `20261108215000_office_romy_akte_maintenance_state_v1.sql` crea estado y reserva por proyecto, sin destrucción de datos. `.github/workflows/romy-akte-pflege.yml` usa OIDC con identidad de workflow Office, no reutiliza autorización de minds. No hay prueba E2E real sin despliegue.

**Pregunta abierta:** el motor heredado de Window genera tareas de mantenimiento sobre su `user_id`. Para Office se acepta solo lectura de materiales compartidos y generación de propuestas con procedencia; ninguna edición de proyecto se confirma sin revisión. La autoría del sistema debe hacerse explícita en una versión posterior antes de incrementar su autonomía. Revertir descartando la rama y la migración todavía no aplicada.
