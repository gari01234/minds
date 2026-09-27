# Isabella · staging v0.3

Web: https://gari01234.github.io/minds/isabella/ — aplicación hermana de Theory.

## Ya conectado

- Home ORB + modo Focus.
- Fondo blanco y mensajes de Isabella sin cápsula de color.
- Swipe Isabella ↔ Calendario en página HTTPS real.
- Calendario Día / Semana / Mes.
- Tareas y eventos locales.
- Supabase como persistencia autenticada.
- Tablas propias para categorías, proyectos, tareas, recordatorios, eventos, memoria, preferencias, personas y follow-ups.
- Conversaciones comparten infraestructura con MINDS, aisladas mediante `app_scope = isabella`.
- Edge Function `isabella-chat` desplegada con autenticación JWT.
- Flujo de acciones: propuesta → confirmación → acción.

## IA

La Edge Function usa la Responses API de OpenAI y el modelo por defecto `gpt-5.6-luna`.

Para activarla hay que configurar en Supabase Edge Function Secrets:

`OPENAI_API_KEY`

Opcionalmente:

`OPENAI_MODEL`

No se guarda ninguna API key en GitHub ni en el navegador.

## Datos

Sin sesión, Isabella sigue funcionando localmente. Con una sesión de MINDS/Supabase, sincroniza la agenda, tareas, memoria y conversación entre dispositivos.

Las categorías iniciales son Casa, Trabajo, MINDS, Personal y Architectures. Trabajo incluye Bernried y Schwarz como proyectos iniciales.


## Automatizaciones / rutinas

Las rutinas recurrentes y los recordatorios únicos de Isabella ya se persisten en Supabase y se ejecutan server-side mediante Supabase Cron + pg_net + la Edge Function `isabella-routine-runner`. Isabella puede proponer una rutina o un mensaje futuro en el chat y la interfaz exige confirmación antes de crearlos. El resultado se escribe en la conversación aunque la web esté cerrada. Web Push sigue siendo una capa separada: no es necesario para que Isabella escriba en el chat, pero sí para mostrar un aviso del sistema operativo fuera de MINDS.


### Feed control desde el chat

Desde Build 28, la constelación e intereses del Feed dejan de ser solo ajustes manuales del navegador. Isabella puede proponer cambios explícitos en bloque —por ejemplo seguir una lista de arquitectos, artistas o estudios que acaba de investigar— y la interfaz pide confirmación antes de aplicarlos. Las preferencias del Feed se sincronizan en `isabella_preferences` con `preference_key='feed'`, de modo que el futuro cliente nativo comparte la misma curaduría.


### Build 29 — Feed, curiosidad y auto-mejora

El Feed usa una Edge Function especializada (`isabella-feed`) con un presupuesto de salida suficiente para producir una edición completa con contexto, en vez de reutilizar el presupuesto corto del chat. Cada edición se firma contra la configuración actual del Feed; un cambio en la constelación invalida automáticamente la caché anterior. Refresh muestra estado visible mientras genera una edición nueva.

Isabella puede hacer preguntas ocasionales y no sensibles para reducir huecos útiles de memoria. La cadencia y el opt-in se controlan desde «Proactividad de Isabella». Las respuestas siguen entrando por la conversación normal y solo se conservan si el sistema de memoria las considera útiles.

Ideas puede incluir una autoevaluación de Isabella. Si el usuario acepta una mejora de comportamiento o workflow, Isabella prepara una propuesta confirmable y la regla queda en preferencias compartidas. No se permite que el agente autoedite o despliegue código desde su propio chat.


### Build 30 — Feed progresivo y persistencia en servidor

El Feed ya no espera a terminar una generación completa para mostrar algo: primero recupera y pinta de inmediato cualquier edición válida de Isabella o Sofía y después completa la portada en segundo plano. La actualización de Sofía no bloquea el refresh de noticias.

La función `isabella-feed` persiste la edición directamente en Supabase y devuelve una respuesta mínima al navegador. Esto elimina el punto frágil anterior en el que Safari tenía que recibir una respuesta grande y volver a insertarla desde el cliente. La generación inicial se reduce a 4–6 tarjetas compactas; el contexto largo se investiga al abrir una noticia. La constelación extensa rota por muestras de entidades en lugar de intentar revisar decenas de nombres en cada refresh.


### Build 31 — refresh asíncrono, stale-while-revalidate y prewarm

El Feed deja de usar una petición HTTP larga. `isabella-feed` crea un trabajo en `minds_feed_jobs`, responde de inmediato y continúa la investigación mediante `EdgeRuntime.waitUntil`. El navegador sigue el estado del trabajo y reemplaza la portada cuando la nueva edición ya está materializada en Supabase.

La interfaz conserva y muestra la última edición disponible aunque haya vencido mientras se revalida en segundo plano. MINDS también inicia un prewarm del Feed después de sincronizar, como máximo una vez cada tres horas, para que la generación pueda ocurrir mientras el usuario está usando Chat, Calendario u otra sección.


### Build 32 — Hoy determinista, 10 noticias y profundidad dentro del Feed

`Hoy` deja de ser contenido editorial generado por IA. Se deriva directamente de los eventos y tareas de la fecha actual, de modo que un refresh de noticias no puede borrarlo ni cambiarlo. Las tarjetas externas de Isabella abren `Leer más` dentro del propio Feed; el chat personal de Isabella deja de ser el destino por defecto para noticias, arquitectura, arte y otros contenidos editoriales.

La sección Noticias admite hasta diez tarjetas por edición. `Para mí` queda reservada para señales personalizadas no operativas: proyectos, entidades seguidas, arquitectura, arte, cultura y otras conexiones derivadas del contexto e intereses del usuario.


### Build 33 — modelo personal, feedback explícito y ciclo de vida

Isabella separa memoria explícita de un modelo personal estructurado. El modelo contiene claims confirmados e hipótesis revisables con confianza y procedencia. En «Lo que Isabella sabe de mí» el usuario puede ver hipótesis, confirmarlas, rechazarlas o corregirlas. La decisión del usuario prevalece sobre cualquier inferencia.

Feed incorpora feedback explícito por tarjeta: «Me gusta», «No es relevante» y «Eliminar». Las señales se persisten en `minds_surface_feedback` y sirven a generaciones posteriores sin convertir el historial en un filtro absoluto. Las tarjetas personalizadas pueden desplegar «¿Por qué esto?» con una razón concreta.

Ideas incorpora ciclo de vida: discutir, dormir o descartar. Dormir una idea crea una entrada en `isabella_return_queue`, con retorno por fecha o por futura evidencia. El briefing matinal incluye agenda, tareas, clima y una selección breve de noticias relevantes.


### Build 34 — investigación autónoma y retornos

Isabella mantiene una cola pequeña de investigación autónoma. Como máximo cada doce horas, y solo si encuentra una pregunta externa con valor personal claro, puede abrir una investigación en segundo plano. El trabajo vive en `isabella_research_queue`; al terminar aparece como una cuarta capa del Feed: «Avances de Isabella». No se crea investigación por rellenar espacio.

Las Ideas dormidas con fecha se reactivan automáticamente al cumplirse su periodo y vuelven con estado `changed`. Las Ideas dormidas «hasta nueva evidencia» permanecen en la cola de retorno para una futura reactivación contextual.


### Build 35 — conversación narrativa y respuestas rápidas

Isabella puede ofrecer opciones de respuesta breves directamente debajo de un mensaje cuando una confirmación no merece un párrafo. Estas opciones se usan especialmente para confirmar hipótesis operativas y conexiones entre partes de MINDS.

Las propuestas de Feed admiten ahora `weather_location`. Cuando Isabella aprende explícitamente una localidad útil pero el clima no tiene ubicación configurada, debe señalar la conexión y pedir confirmación; solo después prepara el cambio.

El modelo conversacional trata el relato natural del usuario como entrada principal: hechos biográficos y rutinas durables pueden pasar a memoria explícita; detalles episódicos se dejan fuera por defecto; conclusiones operativas se mantienen como hipótesis hasta que su uso estable sea confirmado.
