# MINDS · Docling Serve privado

Un servicio de conversión documental separado de Isabella. **No es un nuevo agente ni fuente de verdad**: los originales siguen en Storage de Supabase y los extractos derivados continúan sujetos a Source-First Claims y procedencia.

## Imagen y despliegue

El Dockerfile utiliza **Docling Serve CPU v1.36.0** de la distribución oficial. En Railway, conectar `gari01234/minds`, configurar **Root Directory: /services/docling** y utilizar el Dockerfile y `railway.json` de esta carpeta. Configurar en el gestor de secretos del servicio `DOCLING_SERVE_API_KEY` con un valor aleatorio de al menos 32 caracteres. El servicio debe tener su propio dominio HTTPS gestionado por el hosting. Configurar `PORT=5001` para que el puerto expuesto y la comprobación de salud coincidan. No añadir credenciales a GitHub, URLs, logs ni al navegador.

**Antes de crear el servicio:** confirmar plan, región, costes, cuota de RAM/CPU, retención y política de datos del proveedor. La imagen oficial CPU incluye modelos y es grande; no asumir que cabe en un plan gratuito. El resultado se procesa dentro del contenedor, pero físicamente reside en la infraestructura del proveedor de hosting; `privado` significa servicio controlado y autenticado, no una máquina local ni una garantía absoluta de confidencialidad.

Mantener una sola réplica mientras se use el orquestador local: sus IDs de tareas no se comparten entre contenedores. El scratch debe tratarse como temporal, con política explícita de reinicio/limpieza y sin almacenamiento público. `DOCLING_SERVE_SINGLE_USE_RESULTS=false` permite reintentar la lectura de resultados sin perderlos después de un fallo transitorio del commit; revisar la limpieza de scratch y no aceptar una retención indefinida sin control operativo.

## Habilitación segura en MINDS

1. Confirmar por el endpoint HTTPS del hosting que `GET /ready` pasa a 200 tras cargar los modelos y que `GET /v1/convert/file/async` requiere `X-Api-Key`; probar primero un PDF no confidencial.
2. Configurar **secretos server-side** en el proyecto Supabase `lodexwyyynlarkqgkyhy`: `DOCLING_SERVE_URL` (únicamente origen HTTPS, sin ruta, credenciales ni query) y `DOCLING_SERVE_API_KEY` (el mismo secreto largo del servidor).
3. El trabajador `isabella-work-ingest-runner` comprobará realmente `/ready` antes de reactivar documentos en `waiting_parser`. Nunca enviar documentos solo porque exista una URL. Las solicitudes de conversión contienen bytes privados en multipart autenticado, no URLs firmadas reutilizables.
4. La conversión usa `POST /v1/convert/file/async`, conserva `task_id` en la cola y sondea `GET /v1/status/poll/{task_id}`; solo después de éxito obtiene `GET /v1/result/{task_id}` y escribe segmentos con localizadores y Claims propuestos. Una conversión en curso no se considera `indexed`.
5. Antes de habilitar el backfill de planos grandes, probar un archivo real de alcance acotado, verificar la ruta de origen, cifras y cobertura en `minds_work_source_text_receipts` y que `minds_work_claims.status` permanece `proposed`.

**Limitaciones conocidas:** La extracción de texto no certifica cotas, geometría ni interpretación BIM; se necesitarán pruebas específicas de planos. El tiempo y los recursos de conversión de PDF de 20–48 MiB no están aceptados hasta que el host esté operativo. Si Docling deja de estar disponible, el resto de Work y el calendario deben seguir funcionando, y las fuentes bloqueadas no se declaran leídas. Si los resultados caducan o el contenedor se reinicia, las tareas pueden necesitar recuperación controlada. Ninguna modificación de las decisiones del proyecto se autoriza por sí sola.

Objetivo y pruebas acumulativas: [MINDS issue #113](https://github.com/gari01234/minds/issues/113).
