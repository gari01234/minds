# Puente Window (app iPhone ↔ web) — contrato v1

La app del iPhone es **dueña de la sesión**: el inicio de sesión ocurre una vez en una pantalla nativa y la sesión vive en el Llavero (grupo de la App Group, para que la Share Extension, el widget y los App Intents usen la misma). La web sigue pintando las superficies ricas y **pide** lo que necesita al nativo por este puente.

## Reglas

- Solo responde a la página principal de MINDS: `https://gari01234.github.io` (`isMainFrame`, sin puerto). Cualquier otro origen o un iframe recibe `{ v: 1, ok: false, error: "rejected" }`.
- La web recibe solo el **access token** vigente. El **refresh token nunca sale del Llavero**; el nativo es el único que refresca (Supabase rota los refresh tokens: dos dueños se cerrarían la sesión mutuamente).
- La web no guarda sesión propia: en modo app borra cualquier `sb-…-auth-token` de `localStorage`.
- El nativo no inyecta JavaScript (`evaluateJavaScript`/`WKUserScript`): la web pregunta, el nativo responde.

## Cómo lo usa la web

`shared/supabase-client.js` detecta `window.webkit.messageHandlers.windowNative`. Si existe:

- crea el cliente Supabase con la opción `accessToken` (el token se pide al nativo y se guarda en memoria hasta 60 s antes de caducar);
- sustituye `sb.auth` por una fachada con `getSession`, `getUser`, `refreshSession`, `onAuthStateChange` y `signOut`; `signInWithOtp`/`verifyOtp` abren el inicio de sesión de la app;
- expone `window.WINDOW_NATIVE = { available: true, version: 1, call(type) }`.

Sin el puente (Safari, PWA, escritorio) todo sigue igual que antes.

## Mensajes

Petición: `window.webkit.messageHandlers.windowNative.postMessage({ v: 1, type })` → Promise con la respuesta.

| `type` | Respuesta |
|---|---|
| `session.get` | `{ v: 1, ok: true, session: { access_token, expires_at, user: { id, email } } }` o `session: null` si no hay sesión (la app muestra su inicio de sesión) |
| `session.signIn` | `{ v: 1, ok: true }` — la app muestra su inicio de sesión |
| `session.signOut` | `{ v: 1, ok: true }` — la app borra el Llavero y los datos web y vuelve a su inicio de sesión |
| `app.info` | `{ v: 1, ok: true, app: { name, version, build, capabilities } }` |
| otro | `{ v: 1, ok: false, error: "unsupported" }` |

Cambios incompatibles suben `v`. Las capacidades nuevas (escanear, adjuntar foto, compartir, Quick Look, háptica…) se añaden como tipos nuevos y se anuncian en `app.info.capabilities`.
