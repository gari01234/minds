# THEORY//LAB v0.6 — MIND as active cognition

Abre `index.html` en Edge, Chrome o Firefox. Mantén todos los archivos de esta carpeta juntos.

## Cambio principal

MIND deja de ser una colección de tarjetas, resúmenes y controles cognitivos visibles. Es ahora una superficie editorial continua donde el sistema presenta argumentos desarrollados. Las facultades internas —síntesis, contradicción, Epistemic Debt, reactivación de memoria dormida, challenge, connect, resurface, counterexample, gap y think-forward— existen como orquestación invisible y no como botones o modos.

La versión actual contiene tres desarrollos extensos construidos desde el corpus recuperado: reducción como medio y cadena teleológica; diferencia entre intensificación del fenómeno e intensificación de la sensibilidad; y el horizonte todavía abierto de lo que puede necesitar el ser humano contemporáneo de la arquitectura.

MIND reactiva a Morris únicamente cuando cumple una función crítica puntual, sin restablecerlo como eje central, y mantiene `calma / tranquilidad` como una deuda epistemológica de alta resonancia pero evidencia transversal todavía insuficiente.

## Integración con READINGS y anotaciones

READINGS conserva la funcionalidad de v0.5: textos recuperados, subrayados, notas, navegación al fragmento y persistencia local mediante `localStorage`.

MIND lee `theorylab_v05_annotations` al abrirse. Si existen subrayados o notas, genera una señal autobiográfica discreta basada en recurrencias léxicas. Esta señal **no cuenta como evidencia sobre los autores**; solo informa qué partes del corpus parecen seguir activas en la lectura del usuario.

Esta detección local no sustituye a un modelo vivo. El razonamiento realmente dinámico sobre nuevas anotaciones llegará cuando MIND se conecte a un backend persistente y a un modelo.

## Lo que todavía es prototipo

MIND no llama todavía a un LLM. Los tres argumentos actuales están precomputados a partir del corpus y el feedback disponible. ASK sigue siendo la demo de v0.5. No hay Supabase ni sincronización entre dispositivos.

La siguiente etapa lógica es persistencia real + motor de MIND: Supabase/Postgres para memoria y eventos; embeddings para recuperación; y un proceso de síntesis que solo escriba una nueva pieza cuando detecte suficiente cambio, contradicción, deuda o conexión nueva.
