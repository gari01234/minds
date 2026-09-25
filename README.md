# MINDS

Theory e Isabella son aplicaciones hermanas. Migradas de
`gari01234/minds-theory` en el commit `bfcdfa63350a2a34ff5f0bd0beec2710de368176`.
El repositorio original se conserva intacto.

- `apps/theory`: frontend actual de MINDS - Readings.
- `apps/isabella`: staging actual de Isabella.
- `shared`: mismo cliente Supabase y filtro de migración de caché.
- `supabase/conversation_app_scope.sql`: migración aditiva aplicada al proyecto compartido.

## Publicación

GitHub Pages usa GitHub Actions. El workflow copia cada aplicación a la raíz
del artefacto publicado, sin modificar su diseño ni su comportamiento.

- https://gari01234.github.io/minds/theory/
- https://gari01234.github.io/minds/isabella/

`node --test tests/*.test.mjs` verifica el aislamiento y las rutas.
`node scripts/build.mjs` genera `dist/theory`, `dist/isabella` y `dist/shared`.

## Conversaciones

`conversations.app_scope` es obligatorio e inmutable: `theory` o `isabella`.
Las consultas de conversaciones, recuentos y mensajes filtran por aplicación.
La RLS existente sigue restringiendo el acceso por usuario; app_scope es un
namespace de producto, no una frontera de autorización entre cuentas.

La migración reconoce Isabella por su metadata, su origen assistant/isabella
o los marcadores de sus mensajes. No borra conversaciones ni mensajes.
El trigger mantiene la compatibilidad de los frontends antiguos y evita que
un update cambie una conversación de aplicación. Theory usa una nueva clave
de caché; importa solo conversaciones de Theory, conservando la clave antigua.

El Supabase, el login compartido y las claves públicas se mantienen. No se
modifican ORB, IA, voz, recurrencias, notificaciones ni las Edge Functions.
Ambas nuevas URLs están añadidas a los retornos permitidos de Supabase Auth;
se conserva también la URL original. La migración aplicada quedó registrada
como `20260925154213_minds_conversation_app_scope`.

Verificación de datos tras la migración: una conversación de Theory,
dos de Isabella y nueve mensajes conservados. La consulta de Theory devuelve
cero mensajes de Isabella. Los cuatro tests de aislamiento y rutas pasan.

El historial del sitio antiguo sigue usando su consulta original sin filtros:
para el aislamiento corregido se debe usar la nueva URL de Theory.
