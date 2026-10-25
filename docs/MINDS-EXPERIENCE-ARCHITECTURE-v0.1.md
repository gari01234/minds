# MINDS · Arquitectura de experiencia v0.1

**Fecha:** 25 de octubre de 2026  
**Estado:** propuesta de diseño para revisión. No es una especificación aprobada de navegación ni una implementación.  
**Ámbito:** Isabella PWA/escritorio, iPhone SwiftUI, Lecturas/Sofía, Work, Presence y Thoughts.  
**Base observacional:** trece capturas reales enviadas el 25/10/2026; contraste de solo lectura con `apps/isabella/shell.js`, `dashboard.js`, `work.js`, `app.js`, `apps/theory/v10.js`, `apps/isabella-ios/Sources/RootView.swift`, `DESIGN-SYSTEM-v0.1.md` y `docs/IOS-FUNCTIONAL-PARITY-v0.1.md`. No hay todavía observación interactiva certificada de los trece recorridos ni aceptación en iPhone físico.

## 1. Problema que resuelve este documento

MINDS evolucionó desde una asistente y un calendario hacia un entorno con conversación, atención, trabajo, documentos, conocimiento, investigación, ejecución y obra visual. La arquitectura de datos y autorizaciones ya distingue entidades y estados de gran precisión; la interfaz fue adaptándose a cada incorporación. Hoy tiene una identidad reconocible, pero carece de un modelo transversal explícito que permita decidir jerarquía, distribución espacial y continuidad de interacciones antes de añadir una pantalla.

La tarea de diseño **no** consiste en reducir el producto a un menú minimalista ni en convertir todas las superficies en una estética homogénea. Consiste en disminuir el esfuerzo de orientación, recuperación y verificación **sin disminuir la información que hace posible decidir y actuar**.

**Hipótesis central:** «MINDS es un entorno de continuidad con orientación estable y espacios de trabajo adaptativos». Permite continuar una actividad sin rehacer su contexto. Su estructura global debe poder aprenderse y predecirse; dentro de ella, cada actividad determina el grado apropiado de concentración, densidad y acompañamiento.

Este principio desarrolla la intuición previa «la interfaz se reorganiza alrededor de lo que estás haciendo» pero añade una corrección: **reorganizar el espacio de trabajo no implica mover inesperadamente destinos, acciones ni estados**. La predictibilidad es parte del diseño.

## 2. Vocabulario para evitar confusiones

- **Dominio:** conjunto de entidades y contratos canónicos; p. ej., tareas, proyectos, fuentes, conversaciones, lecturas, decisiones. Un dominio no exige tener pestaña propia.
- **Actividad:** intención humana actual: conversar, orientarse, planificar, trabajar con una fuente, investigar, contemplar. No es necesariamente una URL ni una sección fija.
- **Destino:** lugar estable al que se puede volver: Isabella, Situación, Tiempo, Work, Lecturas, Thoughts. Es una hipótesis de continuidad con los destinos actuales, no una obligación de reproducir exactamente seis pestañas en iPhone.
- **Contexto:** identidad de aquello sobre lo que se actúa: proyecto, tarea, documento, pasaje, hilo, fecha. Debe acompañar las operaciones en que sea pertinente y conservar su procedencia.
- **Superficie:** composición visible: vista exclusiva, panel, inspector, hoja de revisión, interfaz de voz, widget o extensión.
- **Estado canónico:** hecho verificado por la fuente de verdad; se distingue de estados locales de interfaz, estimaciones, observaciones incompletas, propuestas y ejecuciones pendientes de recibo.
- **Continuidad:** recuperación de la misma identidad y del contexto pertinente entre superficies y sesiones; no significa replicar de manera literal cada píxel o posición de scroll entre todos los dispositivos.

Estas distinciones evitan el error de dar una pestaña distinta a cada concepto de backend y el error opuesto de meter entidades heterogéneas dentro de un único chat.

## 3. Inventario funcional y visual: presente, no idealización

La siguiente tabla identifica lo visible en las capturas, el recorrido real en código donde se puede identificar y la necesidad que sirve. **Observado** indica presencia en captura; **código** indica soporte identificable en fuente, no ensayo de uso.

| Superficie existente | Observación o evidencia en código | Actividad y comportamiento que no debe perderse |
| --- | --- | --- |
| Isabella / Chat | Conversación como centro, ORB, compositor, respuesta extensa, paneles de apoyo. `shell.js`, `app.js`, `dashboard.js`. | Preguntar, delegar, recibir respuestas y artefactos, revisar propuestas y recibos, retomar conversación. |
| Escritorio adaptable | Chat, Calendario, Hoy y Plan de trabajo se reparten panel principal y secundarios; preferencias de foco/minimización en `dashboard.js`. | Multitarea comparativa sin duplicar modelos; restaurar la configuración de usuario cuando proceda. |
| Situación / Ahora | Columna editorial: clima, tareas vencidas, fuentes consultadas y recomendaciones; función de cobertura visible. | Orientarse y detectar lo que importa, sin fingir que consulta parcial equivale a totalidad. |
| Situación / Ideas | Ideas en producción, artefactos en desarrollo, propuestas y retorno a trabajos existentes. | Descubrir, revisar y retomar iniciativas sin convertir sugerencias en órdenes ni trabajos concluidos. |
| Tiempo / Hoy | Lista con pocas tareas y espacio abundante; accesos a modificación y planificación. | Resolver lo de hoy con jerarquía temporal, sin inventar bloques para tareas sin hora. |
| Tiempo / Semana | Siete columnas, sesiones, periodos de trabajo, tareas, filtros de proyecto y responsable. | Comparar capacidad y compromisos; preservar semántica de tarea vs. sesión vs. periodo. |
| Tiempo / Mes | Calendario mensual, indicadores, periodos prolongados y acumulaciones. | Reconocer horizontes de carga y fechas; abrir detalle sin perder mes/posición. |
| Work / Panorama | Quinto destino local verificado en `work.js` y en navegación: overview. | Visión ligada al proyecto de compromisos, fuentes y modelo; no inferir que es equivalente a Situación global. |
| Work / Desktop | Selector de proyecto, carpetas, subcarpetas, documentos, metadatos y estados de texto parcial. | Encontrar originales, subir/descargar, navegar jerarquía y reconocer estado de extracción. |
| Work / Planner | Board por buckets, muchas tareas, filtros/team, scroll lateral. | Gestionar distribución, colaboración, revisión y movimientos sin alterar identidad de tarea. |
| Work / Conocimiento | Panel de interpretación/tensiones/ignorancia; claims con inferencia, búsqueda, filtros y revisión. | Separar fuentes, interpretación propuesta, decisión aceptada y desconocimiento estructurado. |
| Work / Threads | Subvista real en `work.js`; su detalle no está cubierto por las trece capturas. | Continuar trabajo contextual y conservar hilo, proyecto, recibos y adjuntos. **Cobertura visual pendiente**. |
| Lecturas / Sofía | Biblioteca editorial de obras, autores, palabras, acceso a lectura, conversaciones y relectura. | Texto completo, subrayados, anotaciones, retorno al pasaje y conversación con procedencia. |
| Thoughts | Obra gráfica autónoma con composición y colores propios dentro del marco de MINDS. | Mantener la autonomía estética e interacciones de la obra; no aplicar componentes operativos encima del contenido. |
| Capa de herramientas | El menú `Más` de `shell.js` incorpora permisos, memoria, revisiones, rutinas, skills, estado del sistema y otros controles. | Acceso claro y verificable a gestión del sistema, sin alterar contratos de privacidad/autoridad. |
| iOS nativo actual | `RootView.swift`: MINDS WebKit, Continuidad, Isabella y Agenda; extensiones Share/Widget. | Paridad funcional progresiva con **toda** la PWA, más Apple. La vista WebKit es un puente, no aceptación final. |

Este inventario es un suelo de conservación, no un listado exhaustivo de endpoints ni de interacciones. Consultar también `docs/IOS-FUNCTIONAL-PARITY-v0.1.md` y `docs/KNOWLEDGE-COVERAGE-ACCEPTANCE.md` para contratos existentes. Ausencia en capturas ≠ ausencia de función.

## 4. Lectura crítica de las capturas y formulación del problema de diseño

### 4.1. Dashboard y conversación
El diseño permite tener la conversación junto a varios contextos; conserva el principio de simultaneidad propio del escritorio. Sin embargo, los tres paneles de la derecha compiten por altura y navegación, y muestran varios scrolls. **Problema verificable:** establecer cuándo conviene presentar simultáneamente Calendario, Hoy y Plan, y cuándo su presencia solo multiplica desplazamientos y duplicados. No eliminar paneles por decreto; revisar contenido, minimización, foco y retorno.

### 4.2. Situación e Ideas
La disposición editorial contiene menos ruido y permite leer un hilo de relevancia. La cuestión no es su anchura reducida, sino que carece de una relación espacial explícita con el workspace modular. Una columna estrecha puede ser correcta para lectura; no debe confundirse con una plantilla aplicable a todos los destinos. «Cuatro fuentes consultadas» y el alcance de consulta son información epistemológica, no decoración.

### 4.3. Hoy, Semana y Mes
En Hoy, mucho blanco puede indicar concentración pero también capacidad desperdiciada cuando el usuario necesita contexto de tareas y fechas; no se corrige rellenándolo con widgets. Semana tiene una composición densa apropiada, pero periodos, sesiones, tareas, eventos y estados deben distinguirse incluso cuando los títulos son largos. Mes es panorámico, no una versión reducida de Semana: exige agregación, marcas y acceso a detalles sin saturar celdas.

### 4.4. Work
Desktop exige lectura de nombres largos y procedencia de originales; el ejemplo real muestra muchos PDFs y etiquetas de texto parcial. Planner exige visión horizontal y controles de reordenación accesibles sin depender exclusivamente del drag. Conocimiento requiere distinguir interpretación, conflicto, fuentes insuficientes y revisión; no debe presentar la prosa de Isabella como conocimiento confirmado. Una sola gramática de tarjetas sería un empobrecimiento de estas tres actividades.

### 4.5. Lecturas y Thoughts
Lecturas necesita densidad editorial, espacio de lectura real y herramientas contextuales mínimas. «0 subrayados» en una fila no significa falta de conocimiento; describe una propiedad concreta. Thoughts no es otra tabla ni una función de Work: es una obra. Su saturación cromática es admisible precisamente porque está confinada a un contexto artístico autónomo. El sistema compartido debe limitarse a entrada, salida, permisos técnicos y accesibilidad de la envolvente.

### 4.6. Jerarquía y escala
Se aprecia una tendencia a usar pesos ligeros, tipografía y metadatos pequeños de manera muy homogénea. En pantalla grande puede parecer delicado; en móvil y accesibilidad puede impedir distinguir lo esencial. La auditoría posterior deberá medir tamaños de fuente reales en CSS/SwiftUI, contraste calculado, Dynamic Type, clippings y focos; no certificarlos desde una captura.

## 5. Estructura de experiencia: estable fuera, adaptativa dentro

Una arquitectura de MINDS debe tener **dos planos simultáneos**:

**Plano de orientación, estable:** nombre reconocible de destino y contexto, cambio de sección predecible, volver, buscar o preguntar, acceso a revisiones y estado general sin duplicar herramientas. El usuario no reaprende la aplicación cada vez que cambia de actividad.

**Plano de trabajo, adaptativo:** distribución, herramientas y densidad apropiadas para la actividad. Se permite un chat expandido, una semana a ancho completo, un tablero horizontal, un inspector documental, una biblioteca con lector o una obra autónoma.

El sistema no debe anticipar deseos reorganizando de forma automática la navegación global. Como máximo, puede ofrecer accesos sugeridos, paneles que el usuario haya elegido y recuperación del último contexto. Las preferencias de paneles deben ser explícitas, conservables y reversibles; no generar migraciones tácitas a nuevas estructuras.

### 5.1. Cuatro regímenes compositivos, no cuatro aplicaciones

**Conversación / coordinación:** cuerpo principal de diálogo, compositor siempre recuperable, estados de atención y revisión no intrusivos; panel contextual optativo. La conversación no es el único lugar donde existen otras entidades.

**Orientación / decisión:** escaneo jerarquizado de pendientes, riesgos, propuestas y fuentes verificadas. Pocas acciones por ítem; poder investigar su fundamento y volver.

**Operación / comparación:** Tiempo, Work Planner, Desktop. Más información simultánea, ejes/columnas, ordenación y filtros; la densidad se justifica por la tarea, no se elimina para uniformar pantallas.

**Lectura / contemplación:** Sofía, documentos y Thoughts. El contenido domina; herramientas de anotación, preguntas y navegación aparecen a demanda. Thoughts mantiene su propia gramática autónoma.

Estos regímenes pueden aparecer como distintos estados del mismo destino. No determinan nombres de pestañas.

## 6. Isabella y Sofía: presencia, autoridad y contexto

La presencia de Isabella es **global como capacidad**, pero **contextual como manifestación**. No necesita un segundo chat para cada destino ni un ORB persistente sobre cada documento. Una pregunta lanzada desde Work debe conservar contexto de proyecto/entidad y el permiso para usarlo. En Lecturas, Sofía conserva su ámbito específico y la trazabilidad de la investigación; «preguntar desde una lectura» no significa trasladar silenciosamente sus fuentes o conclusiones a memoria autobiográfica de Isabella.

Modelo de presencia propuesto:
1. **Modo principal:** conversación a pantalla amplia, sin paneles obligatorios.
2. **Modo contextual:** acción discreta «Preguntar» junto al objeto o la selección, con preview del contexto que se enviará y capacidad de editar/cancelar. Un asunto contextual no se transforma automáticamente en una nueva memoria o tesis aceptada.
3. **Modo ambiental:** estado mínimo recuperable para trabajo que continúa, sin animar artificialmente ni perseguir engagement.
4. **Modo de voz Focus:** escucha y transcripción; sin convertir la voz en otra fuente de autoridad o una segunda entidad.
5. **Ausencia deliberada:** si leer, dibujar o contemplar requiere silencio, Isabella se retira visualmente sin dejar de ser accesible.

**Regla de revisión:** una propuesta debe mostrar diferencia sugerida, objeto exacto, procedencia relevante y consecuencias antes de confirmar. La confirmación genera un recibo verificable y el estado leído de nuevo en servidor. Lo no verificable conserva su estado de incertidumbre. No asignar aprobación a tap de widget/notificación.

**Regla de alcance:** no cruzar dominios privados distintos en una recomendación contextual sin permiso explícito, aunque esos datos estén legitimamente disponibles en memoria.

## 7. Continuidad operacional: no confundir estado visible con estado real

Cada transición importante se modela como: **origen → entidad/contexto → intención → vista destino → acción → confirmación/recibo → regreso**.

Invariantes mínimos:
- Mantener el identificador canónico de proyecto, tarea, conversación, hilo, lectura, documento, propuesta o misión; los rótulos y títulos nunca sustituyen la identidad.
- Diferenciar scroll/selección/filtros temporales (estado UI) de datos validados y estados de servidor (estado canónico).
- Al volver desde una tarea o un PDF, restaurar el contexto navegacional razonable (proyecto, carpeta, semana, origen) cuando existe; no prometer sincronización pixel-perfect entre escritorio y teléfono.
- Si un estado local es antiguo o la consulta falla, usar una descripción honesta («no actualizado», «sin verificar») y un camino para refrescar, jamás mostrar un falso cero.
- En acciones críticas, preservar la petición/idempotency key mientras se reconcilia un resultado ambiguo; no «reintentar» una mutación que puede haberse aplicado.
- No exigir reautenticación repetida por cada navegación interna; pero la sesión WebKit actual y la de Keychain son separadas y no constituyen SSO. No fabricar un token compartido para disimular esa diferencia.

### Recorridos de referencia para orientar el diseño

**J1 · Planificar desde una conversación:** una solicitud sobre la próxima semana abre o enfoca Tiempo sobre la semana correcta; se ve la tarea canónica y se distingue de las sesiones; la propuesta de cambio requiere revisión cuando procede; el regreso preserva el mensaje origen y muestra recibo o incertidumbre.

**J2 · Trabajar con un documento:** Desktop → carpeta → original PDF → extracción/cobertura → preguntar dentro del proyecto → respuesta con fuente → regresar al mismo archivo. Un archivo parcialmente leído permanece parcialmente leído, aunque una respuesta sea fluida.

**J3 · Recibir algo desde iOS:** Share Extension → captura local sin clasificar → admisión canónica separada (pendiente #221) → destino decidido por el propietario → original y recibo → posibilidad de abrir en Work/Lecturas/Thread; no convertir Share en memoria ni conocimiento aprobado automáticamente.

**J4 · Investigar:** Lecturas → texto completo → seleccionar pasaje → subrayar o nota → preguntar a Sofía → respuesta contextual → regresar al mismo pasaje; distinguir texto del autor, interpretación de Sofía y feedback del propietario.

**J5 · Seguir un trabajo delegado:** conversación o Idea → ejecución/Commitment → estado real → entregable disponible → descargar/inspeccionar → retomar Thread; no presentar «pausado» como «en ejecución».

**J6 · Orientación diaria:** Situación → evento relevante → proyecto/tarea exacta → elegir acción → volver al feed con su estado. No contar el mismo hecho como múltiples avisos de PWA/APNs.

**J7 · Contemplar:** acceder a Thoughts, ocupar espacio propio, conservar el comportamiento original de la obra, salir sin que la navegación o la asistencia invadan el contenido.

Estos recorridos son contratos de diseño **a probar**, no afirmaciones de implementación completa.

## 8. Diferencias deliberadas por dispositivo

| Dimensión | Escritorio / PWA amplia | iPhone nativo (destino) |
| --- | --- | --- |
| Navegación | Rail/sidebar estable con nombre accesible; subnavegación local | Acceso directo a los destinos frecuentes; sin seis pestañas comprimidas ni menú oculto inexplicable |
| Composición | Uno o más paneles cuando ayudan a comparar; minimizar/enfocar | Una actividad dominante; detalles en navegación/hojas, no en mini-paneles |
| Tiempo | Semana/mes densos con filtros y comparación | Día y agenda accionables; semana/mes adaptados sin suprimir filtros ni semántica |
| Work | Board horizontal, Desktop de muchos archivos, paneles de Conocimiento | Información reorganizada (listas, vistas detalladas, filtros); mismas operaciones y fuentes |
| Lectura | Lector con notas/inspector si cabe | Texto prioritario, selección contextual, anotaciones sin barra permanente invasiva |
| Conversación | Panel coexistente o vista enfocada | Conversación completa, acceso contextual desde otras vistas, estados explícitos |
| Apple | PWA/Web Push/desktop shell donde proceda | Share, APNs, WidgetKit, Siri/Atajos y Watch condicionado a hardware y permisos |

No hacer equivalencia mediante zoom o iFrames interminables. El puente WebKit de PR #222 queda como cobertura transitoria; no retirarlo antes de superar la matriz de paridad y aceptación en iPhone.

## 9. Reglas preliminares de jerarquía visual (todavía NO Design System v0.2)

1. **Primero jerarquía semántica:** ¿qué es título, valor, estado, evidencia, acción? Solo después elegir tamaños, color o contenedor.
2. **Densidad motivada:** información simultánea para comparar; espacio para leer; ausencia de decoración no es razón para reducir letra.
3. **Interacciones consistentes:** lo que se presenta como enlace navega; botón ejecuta o prepara una acción; propuesta solicita aprobación sin anticipar resultado; indicador de estado no debe parecer clicable si no lo es.
4. **Color con contrato:** los colores de proyectos/sesiones no son intercambiables con advertencias, confirmaciones y fallos. Apoyar siempre con texto/símbolo.
5. **Movimiento subordinado:** continuidad espacial, feedback inmediato, cancelación/reversión; respetar Reduce Motion, batería y legibilidad.
6. **Accesibilidad estructural:** orden de foco, etiquetas, estados anunciados, escalado, tamaños táctiles, lectura de contenidos densos, keyboard y VoiceOver antes de declarar listo.
7. **No homogeneizar lo irreductible:** la gramática de un documento o de Thoughts no debe reemplazarse por tarjetas de dashboard.
8. **No fabricar certezas mediante diseño:** evidencia, ausencia de cobertura y fallo parcial visibles con fuerza adecuada.

La paleta, espaciados y tipografía de `DESIGN-SYSTEM-v0.1.md` son un punto de partida preservado. No se cambian tokens, colores ni archivos productivos en este estudio.

## 10. Condiciones de éxito, falsación y decisiones abiertas

**Éxito de experiencia** será que el usuario pueda reconocer dónde está, qué actividad realiza, sobre qué objeto actúa, qué acción está disponible, qué ha cambiado verdaderamente y cómo regresar, tanto tras navegación como al cambiar de dispositivo. Debe hacerlo sin perder capacidades que ya tenía. Medir tareas completadas, errores de destino, dudas sobre autoridad, pasos para recuperar contexto, accesibilidad y regresión funcional; no engagement o tiempo de uso.

**La hipótesis de diseño queda refutada** si «simplificar» oculta funciones importantes, multiplica pasos, produce desorientación, hace indistinguibles los estados de conocimiento o sustituye simultaneidad necesaria por navegación excesiva.

**No aprobadas en v0.1:** distribución y nombres definitivos de pestañas iPhone; acceso a Thoughts; presencia concreta de Isabella en Lecturas; personalización de paneles; uso de una búsqueda global; diseño de recibos; escala tipográfica exacta; diseño visual del ORB y su animación. Son asuntos para evaluar con la matriz de alternativas y los recorridos de aceptación, no decisiones tácitas.

**Se preservan como decisiones previas:** equivalencia funcional total PWA→iOS + Apple; Supabase como única fuente de verdad; un único runtime y una única Isabella; separación epistemológica de original, extracción, interpretación y aceptación; operaciones consecuentes sujetas a permiso/recibo; Thoughts autónomo; Build 101 = Daily & Weekly Workload Intelligence; PRs acotados, sin cambios productivos por una propuesta de diseño.

## 11. Relaciones con otros documentos

- [Opciones de navegación y recomendación provisional](MINDS-NAVIGATION-OPTIONS-v0.1.md).
- [Pruebas de diseño y criterios de aceptación](MINDS-EXPERIENCE-ACCEPTANCE-v0.1.md).
- [Design Language v0.1](../DESIGN-SYSTEM-v0.1.md) — histórico y tokens existentes, no reemplazado.
- [Equivalencia funcional iOS](IOS-FUNCTIONAL-PARITY-v0.1.md) — prevalece si hubiera conflicto.
- [Handoff iOS](IOS-VNEXT-CONTINUITY-2026-10-25.md).
- [Guía Apple: Design foundations from idea to interface](https://developer.apple.com/videos/play/wwdc2025/359/) — estructura, navegación, contenido, diseño visual.
- [Guía Apple: Principles of great design](https://developer.apple.com/videos/play/wwdc2026/250/) — propósito, agencia, responsabilidad, familiaridad, flexibilidad, simplicidad, oficio y disfrute.
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).
- [HIGAgentSkills](https://github.com/justinwetch/HIGAgentSkills) y [apple-design, Emil Kowalski](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) — referencias secundarias de consulta, **no runtime ni autoridades sobre MINDS**.

Las capturas privadas se han utilizado como evidencia de observación, **no se copian a este repositorio**. Las evaluaciones de diseño deben conservar su relación con esas capturas sin replicar datos identificables innecesarios.
