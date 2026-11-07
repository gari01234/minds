# Puente Window (app iPhone ↔ web) — contrato v1

La app del iPhone es **dueña de la sesión**: el inicio de sesión ocurre una vez en una pantalla nativa y la sesión vive en el Llavero (grupo de la App Group, para que la Share Extension, el widget y los App Intents usen la misma). La web sigue pintando las superficies ricas y **pide** lo que necesita al nativo por este puente.

## Reglas

- Solo responde a la página principal **de la cuenta de esa página** (`isMainFrame`, https, sin puerto): `https://gari01234.github.io` para Persönlich (MINDS) y `https://tbarchitekten.github.io` para Office (TBA Office). Cualquier otro origen o un iframe recibe `{ v: 1, ok: false, error: "rejected" }`.
- Cada cuenta tiene su propia `WKWebView`, su propio almacén web (cookies, localStorage) y su propia sesión en el Llavero. La página de Office solo recibe el token de Office, y la de Window solo el de Window.
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
| `app.info` | `{ v: 1, ok: true, app: { name, version, build, account, capabilities } }`. `account` es `personal` u `office` |
| `nav.open` | `{ section, view? }` → la app cambia a la pestaña de esa sección (`assistant`, `feed`, `calendar`, `work`, `bandeja`, `ideas`). `view` solo para `bandeja`: `confirm`, `suggest` o `ideas`. `{ v: 1, ok: true }` |
| `shell.badge` | `{ count }` (entero 0–999): el número de «Por confirmar» de la Bandeja, para el badge de la pestaña. Solo en Persönlich. `{ v: 1, ok: true }` |
| `account.switch` | `{ to }` (`personal` u `office`): la app muestra la otra cuenta, con su propio inicio de sesión si hace falta. `{ v: 1, ok: true }` |
| otro | `{ v: 1, ok: false, error: "unsupported" }` |

## Pestañas (`shell.tabs`)

Con `shell.tabs` en `capabilities`, la web entra en modo app: oculta su propia barra y la app muestra la suya (Chat · Ahora · Tiempo · Work · Bandeja). Todas las pestañas muestran **la misma página web** (una sola `WKWebView` que pasa a la pestaña activa). La app elige la sección con el fragmento de la URL (`#section=feed`, `#section=bandeja&view=ideas`, `#section=work&project=…`); si la web quiere abrir una sección de otra pestaña, lo pide con `nav.open`. Lecturas y Thoughts se abren dentro de la pestaña actual desde el menú «•••». La web solo envía `shell.badge` si la app anuncia esa capacidad.

## Dos cuentas (desde el 07.11.2026)

Como cambiar de usuario en GitHub: **Persönlich** (Window, inicio con código por correo) y **Office** (TBA Office, su propio proyecto de Supabase, inicio con correo y contraseña de la oficina). Cada una guarda su sesión y sus datos; no se copia nada entre ellas.
- En Office, las pestañas son Romy · Heute · Kalender · Work · Tools (secciones `assistant`, `feed`, `calendar`, `work`, `tools`). `projects` y `plans` se abren en Tools.
- Se cambia desde el menú «•••» de la web ("Cambiar a Office" / "Zu Persönlich wechseln", solo si la app anuncia `account.switch`) o desde la pantalla de inicio de sesión de cada cuenta.
- El widget, la Share Extension y Siri siguen usando solo la cuenta Persönlich.

Cambios incompatibles suben `v`. Las capacidades nuevas (escanear, adjuntar foto, compartir, Quick Look, háptica…) se añaden como tipos nuevos y se anuncian en `app.info.capabilities`.
