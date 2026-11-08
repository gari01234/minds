# Romy = Isabella · Fase 1 · Contrato estructural
Fuente: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, §3.4 y fase 1 (08.11.2026).

## Extracción y política
La reconstrucción de Office utiliza exclusivamente metadatos de `pg_catalog` del esquema de Window: nombres, columnas, tipos, restricciones, índices y relaciones, sin registros ni contenido de usuarios. Las migraciones se versionan únicamente en Office. Los datos de Window no se copian en ningún momento.

En Office, el modelo privado requiere `auth.uid() = user_id` y una membresía activa; la Projektakte compartida requiere membresía del equipo del proyecto, incluso para administradores. Las tablas que guardan decisiones, recibos y material de modelo no quedan modificables directamente por REST: las escrituras deben pasar por RPCs con autoridad y comprobaciones independientes. Los Threads de Work continúan siendo privados.

Las claves y endpoints de las dos instalaciones permanecen segregados. Los valores de `isabella_runtime_secrets` se dejan vacíos; no se ejecuta el heartbeat hasta que el administrador configure sus parámetros fuera del código. No se permiten `DROP`, `TRUNCATE`, migraciones aplicadas a producción ni despliegues.

## Implementación estructural en Office (sin aplicar)

Office PR #57 tiene 90 tablas nuevas, 16 migraciones ordenadas, RLS de propietario/proyecto, vistas y procedimientos de runtime basados en metadatos del esquema de Window. Los workflows de PostgreSQL 17 efímero y Supabase local verifican RLS, privilegios negativos, RPC y ausencia de datos copiados. La migración contiene una plantilla inerte de heartbeat; no se ha ejecutado en producción. La aceptación es exclusivamente de estructura y autorización SQL, no de operación real del asistente.

## Aceptación y deudas
La suite SQL de Office usa miembros/proyectos ficticios y transacción `ROLLBACK`. La CI de fase 1 debe aplicar todas las migraciones en una instancia local efímera y comprobar aislamiento de propietarios, equipos y credenciales.

La equivalencia del motor completo requiere además verificar las RPC usadas por el runtime y su adaptación a la autoridad de Office. No debe declararse operativa la fase ni avanzar a fase 2 sin esa verificación y CI verde. Para perfil `window`, estas migraciones no alteran nada: diferencia de `promptComponentSizes` de esta fase, cero.

## Pregunta abierta
Las restricciones de Window relativas a Lecturas/Thoughts/Ideas no existen en Office. Se excluyen deliberadamente las cuatro dependencias de esos dominios y se conserva la ausencia como deuda explícita, en vez de crear entidades ficticias que pudieran abrir una vía de acceso entre proyectos.

## Deshacer
Revertir las migraciones en un entorno de desarrollo desechable. No se debe revertir por cambios destructivos en producción; cualquier rollback tras aplicación debe diseñarse y autorizarse expresamente. Ningún dato de Office se modifica en este PR.
