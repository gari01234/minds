# MINDS - Theory v0.10

MINDS - Theory es un prototipo de “tercer cerebro” para investigación teórica arquitectónica. La interfaz principal se organiza en dos lugares: **MINDS** y **LECTURAS**. **Preguntar a MINDS** funciona como una capacidad transversal.

## Qué cambia en v0.10

v0.10 introduce memoria persistente con Supabase sin sustituir todavía el motor cognitivo local.

- **Supabase pasa a ser la fuente de verdad** una vez que el usuario inicia sesión.
- `localStorage` permanece como caché/offline bridge para conservar compatibilidad con v0.9.1.
- La primera vez que se detecta memoria local y la cuenta remota está vacía, MINDS pide confirmación antes de migrarla.
- Después de la migración, subrayados, notas, conversaciones, “Por volver” y hilos fijados se sincronizan entre dispositivos.
- Los textos completos del corpus y los hilos actuales de MINDS se registran en Supabase con IDs persistentes.
- Las conversaciones conservan su contexto de origen: global, hilo de MINDS o lectura/pasaje.
- Las respuestas siguen siendo locales y provisionales: todavía no hay un LLM conectado.

## Arquitectura actual

### MINDS

Los pensamientos son hilos longitudinales, no entradas de blog. Cada hilo puede tener versiones, eventos de activación/reactivación, marcas y conversaciones. “Activo” y “latente” son estados derivados; nada se borra por dejar de estar cerca.

### LECTURAS

Conserva los textos completos recuperados, subrayados, notas, conversaciones, “Por volver” y Relectura.

### Preguntar a MINDS

No es una sección principal. Puede invocarse globalmente o desde una selección de texto. Toda conversación queda guardada y trazable.

## Persistencia

Frontend público:

- GitHub Pages
- `supabase-js` en el navegador
- URL del proyecto + **publishable key** únicamente

Backend:

- Supabase Postgres
- Auth
- Row Level Security
- esquema privado para futura recuperación semántica / embeddings

Nunca deben guardarse en GitHub:

- service-role / secret keys
- claves de modelos de IA
- contraseñas
- secretos de Edge Functions

## Auth

La interfaz usa inicio de sesión por email mediante Magic Link.

Para producción, en Supabase debe configurarse la URL del sitio:

`https://gari01234.github.io/minds-theory/`

y permitir esa misma URL como redirect de Auth.

## Próxima fase

Después de validar login + migración + sincronización en ordenador y móvil:

1. conectar **Preguntar a MINDS** a una Edge Function con IA;
2. implementar recuperación contextual sobre memoria propia;
3. mantener separada la exploración “fuera de mi memoria”;
4. construir el motor proactivo de MINDS para detectar conexiones, deuda epistémica, contradicciones y reactivación de memoria dormida sin convertir propuestas de IA en tesis aceptadas silenciosamente.
