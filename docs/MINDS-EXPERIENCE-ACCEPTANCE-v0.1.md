# MINDS · Protocolo de validación de experiencia v0.1

**25/10/2026 · Propuesto, no ejecutado.** Este documento define cómo comprobar el futuro rediseño **antes de modificar la interfaz** y cómo distinguir calidad visual, integridad funcional, verdad del sistema y accesibilidad. Complementa [Arquitectura de experiencia](MINDS-EXPERIENCE-ARCHITECTURE-v0.1.md) y [Opciones de navegación](MINDS-NAVIGATION-OPTIONS-v0.1.md); ninguna prueba aquí constituye una nueva capacidad de Isabella.

## 1. Jerarquía de evidencias

| Nivel | Puede establecer | No puede establecer |
| --- | --- | --- |
| Contrato/documentación | Propósito, criterios, cobertura esperada | Que algo esté implementado |
| Inspección de código | Existencia de componentes, routes y validadores | Que responden bien a inputs/dispositivo real |
| Test determinista | Comportamiento bajo fixtures y entradas cubiertas | Ausencia total de regresiones, usabilidad o calidad estética |
| Captura de pantalla | Composición observable en un estado | Gestos, VoiceOver, persistencia, navegabilidad completa |
| Simulador iOS | Build, estados visuales y algunas interacciones | Firma real, notificaciones/Share completos, rendimiento físico |
| Prueba autenticada real | Recorrido concreto, recibos, estado persistente, accesibilidad observado | Perfección general ni escenarios no probados |
| Uso repetido con propietario | Fricción, descubribilidad, continuidad cotidiana | Garantía automática para versiones futuras |

Los tests actuales de MINDS y la compilación SwiftUI no sustituyen estas capas. Las trece capturas aportadas en conversación son un baseline observacional **privado**; no introducirlas en un repositorio público ni como fixtures con datos personales.

## 2. Congelar el baseline sin congelar errores

Antes de dibujar prototipos nuevos, inventariar rutas, estados y contratos observables de la PWA de producción: Chat, Situación Ahora/Ideas, Tiempo día/semana/mes, Work Panorama/Desktop/Planner/Conocimiento/Threads, Lecturas/Sofía, Thoughts y menú transversal. Registrar viewport, estado del usuario, fecha, proyecto, fuentes disponibles, scroll, accesos y capturas autorizadas. Complementar con recorridos que las capturas **no muestran**: Work Threads y panorama en detalle, lectura abierta, selección/anotación real, menús, acciones de tareas, reviews, uploads/downloads, errores y modo móvil.

Guardar resultados de revisión en documentación privada o fixtures sintéticos. Identificar claramente los estados observados frente a los que solo se inferían del código.

## 3. Matriz mínima de journeys: no se aprueba una pantalla aislada

| ID | Recorrido que debe ejecutarse | Evidencia de aceptación |
| --- | --- | --- |
| J01 | Chat → localizar mensaje/hilo anterior → continuar | Mismo hilo/identidad, borrador y orden recuperables; no conversación paralela creada silenciosamente |
| J02 | Chat → propuesta de cambiar fecha → revisar diferencias → cancelar | Cambio **no aplicado** confirmado por lectura canónica y feedback comprensible |
| J03 | Chat → revisar y confirmar acción autorizada → recibo | Receipt ID o referencia verificable y readback exacto; no «éxito» por texto del modelo |
| J04 | Situación → recomendación → tarea/proyecto → volver | Identidad correcta, fuente y cobertura visibles, retorno al lugar previo |
| J05 | Situación → Ideas → artefacto o propuesta → continuar | Estado real preservado (propuesto/en ejecución/pausado/completado) y origen reconocible |
| J06 | Tiempo Hoy → seleccionar tarea → crear/reservar sesión si procede | Tarea y sesión siguen siendo entidades distintas; fecha sin hora no ocupa bloque |
| J07 | Tiempo Semana ↔ Mes ↔ Día → cambiar fecha/filtros → regresar | Semana/mes correctos, filtros recuperados, sin pérdida de tareas ni superposiciones |
| J08 | Work Desktop → subcarpeta → documento largo/PDF → descargar → volver | Original/versionado, identidad, nombre completo y estado de lectura accesibles |
| J09 | Work Planner → abrir task → cambiar bucket/responsable mediante review válida | RLS/permiso/receipt sin duplicar tarea; controles no limitados a arrastre |
| J10 | Work Conocimiento → claim propuesto → fuente/cobertura → revisar | Inferencia no se presenta como hecho confirmado; acceso a desconocimiento y conflicto |
| J11 | Work Threads → buscar/hablar en hilo → adjunto/resultado → volver | Contexto de proyecto/thread correcto sin mezclar datos de otro hilo |
| J12 | Lecturas → abrir texto completo → subrayado/nota → preguntar a Sofía → regresar | Pasaje exacto y anotación recuperables, procedencia y scopes preservados |
| J13 | Thoughts → contemplar/interactuar → salir | Obra mantiene visual e interacción propios; retorno sin overlays intrusivos |
| J14 | iPhone Share → bandeja local → origen intacto → destino → recibo | **Pendiente #221**; no marcar logrado si solo existe captura local |
| J15 | APNs/Web Push/widget → abrir objeto correspondiente | Consentimiento, deduplicación, privacidad y destino exacto; **pendiente Apple** |
| J16 | Interrumpir sesión en un dispositivo y continuar en otro | Entidad y estado canónicos coherentes; estados UI locales tratados honestamente |
| J17 | Expirar sesión/logout → cambiar cuenta → volver | Ningún contenido de otro propietario; Keychain y WebKit separados hasta integración segura |
| J18 | Error, timeout o dato parcial durante una operación | No falso vacío/éxito, sin reintentar mutación ambigua, recuperación explicable |

**Regla:** una variante de navegación no obtiene aceptación si mejora la apariencia mientras empeora alguno de estos recorridos. Los journeys con capacidades no implementadas se etiquetan **pendientes**, nunca «pass».

## 4. Pruebas por situación y tamaño

Probar cada composición relevante con al menos estos estados: contenido vacío real; error de fuente; carga prolongada; datos parciales; contenido extenso; nombres sin espacios; caracteres españoles/alemanes y tipografía no latina; fechas/semana de cambio horario; 1 y decenas de tareas/archivos; 0 y múltiples propuestas; permisos denegados; dispositivo offline; sesión caducada; trabajo pausado. La elección de ejemplos nunca debe modificar datos canónicos.

**iPhone:** orientación y safe areas, teclado abierto, composición de chat, teclado/panel en revisión, texto dinámico grande, VoiceOver, Switch Control y control mediante teclado cuando exista, Reduce Motion/Transparency, modo oscuro/alto contraste, enlaces externos, archivos, background/reanudación, permisos y notificaciones reales. No proclamar compatibilidad iPhone Duo ni APIs futuras sin dispositivo/SDK apropiado.

**Escritorio:** ventanas anchas y estrechas, varias resoluciones, zoom 125–200%, navegación por teclado, lectura en dos columnas, multi-panel, desplazamiento independiente y restauración de foco, Planner horizontal y scroll vertical. Verificar que cambio de destino no desordene el rail ni recree mensajes.

## 5. Modelo de revisión visual y cognitiva

Evaluar cinco dimensiones independientes, con **evidencia no sustituible**:

**O · Orientación.** El contexto (destino, proyecto, fecha, fuente, hilo) es discernible; back y breadcrumbs funcionan; nombres, símbolos y acciones mantienen significado entre superficies.

**L · Legibilidad.** Jerarquía de tipografía, contraste y densidad acorde con la actividad; títulos largos e indicadores de estado comprensibles; VoiceOver comunica jerarquía. Capturas son evidencia visual parcial, no prueba de contraste o asistencia.

**A · Agencia y autorización.** Diferenciar inspección, edición, propuesta, confirmación, cancelación y recibo; consecuencias visibles; errores recuperables; sin taps pasivos convertidos en autoridad.

**C · Continuidad.** Retorno, reanudación, contexto por entidad y procedencia conservados; cross-device coherente; incertidumbre honesta en consultas incompletas.

**P · Presencia proporcional.** Isabella ayuda sin ocupar el lugar de la actividad; el ORB no anima sin significado; Thoughts y Lecturas preservan concentración; notificaciones siguen Attention Economy.

No usar una única puntuación arbitraria que compense un fallo grave de permiso o pérdida de datos con buenos resultados estéticos. Los resultados deben ser **verificado, parcial, fallido, no ensayado** para cada criterio y cada evidencia. Un resultado no ensayado no es cero ni success: queda en deuda de validación.

## 6. Método de trabajo inspirado en Apple y bibliotecas externas

Fuente primaria: Apple [Design foundations from idea to interface](https://developer.apple.com/videos/play/wwdc2025/359/), [Principles of great design](https://developer.apple.com/videos/play/wwdc2026/250/), [HIG](https://developer.apple.com/design/human-interface-guidelines/) y [Design Resources](https://developer.apple.com/design/resources/).

Fuente auxiliar: [HIGAgentSkills](https://github.com/justinwetch/HIGAgentSkills) para localizar referencias específicas y realizar auditorías basadas en evidencias; [Emil Kowalski apple-design](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) para respuesta, movimiento interrumpible y gestos; [mobile-native](https://github.com/emilkowalski/skills/tree/main/skills/mobile-native) para las anomalías específicas de PWA táctil.

El corpus HIG de terceros no forma parte del prompt ni de la memoria operativa de Isabella. Se consulta **fuera del runtime**, por necesidad temática. Cualquier afirmación normativa se verifica contra Apple original y se etiqueta por fuerza (obligatoria, recomendada, condicional, juicio propio). Las puntuaciones de herramientas externas no constituyen certificación Apple. No incorporar copias de material con derechos de Apple al repo porque un wrapper tenga licencia MIT.

## 7. Orden de prototipado y criterios de salida

**Fase 0 — baseline:** registrar matriz real de rutas y muestras de los journeys J01–J13; evidencias privadas/sintéticas, sin acciones productivas invasivas. Salida: inventario sin destinos omitidos.

**Fase 1 — dos alternativas iPhone:** B1 y B2 para conversar/planificar, Work documento y Lecturas; mocks SwiftUI de navegación con fixtures **sin** nuevas credenciales ni endpoints. Salida: comparación con costes observados y feedback del propietario, no preferencia visual automática.

**Fase 2 — arquitectura elegida:** pactar explícitamente destinos, regreso, búsqueda, preguntar-contextual, revisión y acceso a Thoughts. No aprobar implementación si hay funciones sin ubicación identificada.

**Fase 3 — Design System v0.2:** especificar tipografía dinámica, escalas, densidades, iconografía, color semántico distinto de categorías, material por plano, component states y movimiento. Mapear tokens web/nativo sin duplicar lógica. Conservar el ORB aprobado hasta demostrar una razón para modificarlo.

**Fase 4 — implementación incremental:** PRs por recorrido, no por «hacer toda la app»; cada cambio trae check de paridad con PWA, test de estado/permiso/receipt y prueba visual/funcional. Mantener WebKit como fallback hasta aceptación real. Ninguna migración de backend ni reemplazo de API por razones estéticas.

**Fase 5 — device acceptance:** instalar TestFlight firmado y comprobar journeys críticos en iPhone real. Antes de eso, un build de simulador exitoso significa únicamente que el código construye en ese entorno.

## 8. Deudas específicas visibles en octubre 2026

1. **Ruta de vuelta e inspector:** clic «Abrir conversación para revisar» en Continuidad SwiftUI navega al chat genérico, sin deep link exacto a la revisión observada.
2. **Paridad nativa incompleta:** el puente WebKit garantiza que existe un acceso, no que sesiones, upload/download, voz, navegación, permisos o UI funcionen igual que Safari/PWA.
3. **Motion/accessibility:** `OrbView.swift` incorpora una animación repetitiva y una escala fija; necesita evaluación explícita de Reduce Motion, Dynamic Type y contraste antes de modificarla.
4. **Múltiples scrolls dashboard:** comparar tres paneles complementarios frente a uno contextual seleccionable; no eliminar simultaneidad útil por estética.
5. **Tipos de lectura en Desktop:** «texto parcial» y «sin confirmar» deben tener presentación inteligible pero no convertirse en una advertencia escandalosa sobre cada fichero.
6. **Estados distintos en Tiempo:** periodo, sesión, tarea y evento no deben compartir una codificación que dependa solo de un matiz cromático.
7. **Horizonte visual no capturado:** faltan capturas/observaciones de Work Threads completo, lector abierto y flujos de aprobación/errores.

Estas deudas no son fallos demostrados de ejecución salvo donde se indique un comportamiento visible en código. Son puntos de inspección que tendrán que comprobarse con interacción.

## 9. Gobernanza de decisiones

La base de código y Supabase siguen intactos durante esta fase de diseño. Los documentos proponen reglas y variantes; no se convierten silenciosamente en decisiones aprobadas. Toda decisión posterior debe registrar: problema, evidencia de uso, opciones consideradas, elección, coste de alternativas, reversibilidad, fuentes y prueba de aceptación. El feedback del propietario puede revisar una decisión, preservando el registro anterior.

**No tocar:** Build 101 (Daily & Weekly Workload Intelligence), issues de Knowledge Coverage/conversación/coste, contratos de permisos, original→extracción→claim, RLS, Apple signing, Share intake/APNs/Watch hasta sus gates propios.

La regla final es sencilla: **se rediseña la experiencia, no se sustituye la identidad ni el patrimonio funcional de MINDS**.

## Artefacto de ensayo añadido 26/10/2026

[Design Lab B1/B2](https://gari01234.github.io/minds/isabella/design-lab/) permite comparar con fixtures ficticios tres flujos representativos (tarea/revisión; PDF/contexto; lectura/anotación) y el acceso a Thoughts. El contador de interacciones es un **indicador descriptivo del prototipo**, no un benchmark empírico de usabilidad. Se necesita observación real en móvil, dificultad percibida, retorno, accesibilidad y feedback explícito antes de decidir la navegación. Los demás journeys J01–J18 siguen pendientes de aceptación auténtica. No se ha añadido ninguna acción productiva ni API.
