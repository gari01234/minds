# Supabase · MINDS - Theory v0.10

El proyecto de producción ya existe en Supabase y la arquitectura de memoria v0.2 está aplicada mediante migraciones.

## Estado actual

Migraciones aplicadas:

- `minds_memory_architecture_v02`
- `minds_memory_hardening_v021`
- `minds_v010_persistence_support`
- `minds_v010_message_idempotency`

Las tablas principales son:

- `documents`
- `annotations`
- `reading_state`
- `mind_threads`
- `mind_thread_versions`
- `mind_thread_events`
- `mind_annotations`
- `conversations`
- `conversation_messages`
- `memory_events`
- `memory_links`

La capa futura de recuperación semántica vive en el esquema privado `minds_private`, actualmente con `memory_chunks`.

## Seguridad

Todas las tablas de usuario tienen Row Level Security. El navegador opera únicamente con la **publishable key** y una sesión autenticada. El esquema privado no tiene acceso para `anon` ni `authenticated`.

Nunca deben exponerse en el frontend ni guardarse en GitHub:

- service-role / secret keys;
- contraseña de Postgres;
- claves de proveedores de IA.

## Auth

v0.10 usa Magic Link por email.

En Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://gari01234.github.io/minds-theory/`
- Redirect URL permitida: `https://gari01234.github.io/minds-theory/**`

## Nota sobre schema.sql

El antiguo `schema.sql` v0.1 ya no representa la arquitectura actual y no debe ejecutarse sobre el proyecto de producción. La base real está gobernada por las migraciones anteriores. Se sustituirá por un snapshot reproducible cuando cerremos la fase v0.10.
