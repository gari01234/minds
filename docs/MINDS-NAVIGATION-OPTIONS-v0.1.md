# MINDS · Opciones de navegación y arquitectura espacial v0.1

**Fecha:** 25/10/2026 · **Estado:** alternativas analizadas, preferencia provisional; ninguna navegación nueva aprobada o implementada.  
**Dependencia:** [Arquitectura de experiencia v0.1](MINDS-EXPERIENCE-ARCHITECTURE-v0.1.md).  
**Regla:** conservar todos los destinos, operaciones y fuentes de la webapp y todos los contratos de permiso. La plataforma puede cambiar composición y accesos, no identidad ni alcance.

## El criterio para elegir

La mejor organización no es la de menos iconos ni la de menos pantallas. Debe cumplir simultáneamente:
1. **Orientación:** identifico destino, contexto, actividad y camino de regreso.
2. **Acceso:** las capacidades frecuentes y críticas son recuperables sin adivinar dónde están; las poco frecuentes siguen siendo descubribles.
3. **Continuidad:** desde una fuente, pasaje, fecha, tarea o hilo puedo preguntarle a Isabella y volver sin perder origen, sujeto ni evidencia.
4. **Escala:** una pantalla móvil no requiere reproducir seis paneles de escritorio; un escritorio no debe perder comparación.
5. **Gobernanza:** propuestas, revisiones, recibos, estados y cobertura tienen lugares inteligibles, sin elevar sugerencias a hechos.
6. **Conservación:** ninguna simplificación de la navegación puede retirar o esconder de manera irrecuperable el contenido y las acciones existentes.
7. **Carácter:** Lecturas mantiene lenguaje editorial y Thoughts autonomía artística; no son tarjetas genéricas de un dashboard.

Evaluamos respecto a la experiencia observada, no a una app imaginaria.

## A · Reproducir el mapa actual como arquitectura permanente

**Estructura:** web con seis destinos Chat, Situación, Tiempo, Work, Lecturas y Thoughts; iPhone con cuatro tabs SwiftUI MINDS Web, Continuidad, Isabella y Agenda. El contenido que falta nativamente se accede mediante el portal WebKit.

**Ventaja:** coste inmediato mínimo, continuidad técnica, no altera los recorridos existentes y conserva todas las funciones mediante el puente.

**Coste de experiencia:** MINDS Web y Chat/Agenda/Continuidad se solapan en iOS, con dos sesiones independientes. Un mismo concepto puede aparecer en varios lugares sin un criterio de orientación. El panel temporal del dashboard y el calendario completo también se parecen a veces. «Continuidad» es una capacidad transversal presentada como destino competidor.

**Veredicto:** **baseline transitorio correcto** tras PR #222, **no concepto final de interacción**. Retirarlo sin cobertura real sería regresión.

## B · Destinos estables + espacio de trabajo adaptable — recomendado para prototipar

**Estructura de escritorio:** mantener, como punto de partida, seis destinos reconocibles: **Isabella, Situación, Tiempo, Work, Lecturas, Thoughts**. La barra lateral permanece estable y la jerarquía local depende de cada uno: Situación → Ahora/Ideas; Tiempo → Día/Semana/Mes y Hoy; Work → Panorama/Desktop/Planner/Conocimiento/Threads; Lecturas → lista/lector/anotaciones/relectura; Thoughts → obra autónoma. «Preguntar» es una capacidad universal contextual, no un séptimo destino. Revisiones, permisos, memoria, skills y Doctor se agrupan en herramientas o bandejas accesibles sin convertirse en navegación de primer nivel.

**Espacio adaptable:** en Isabella, escritorio modular opcional con Chat + Calendario/Hoy/Plan, según foco y preferencias; en Tiempo se privilegia la comparación; en Work cada subvista posee su composición; en lectura y Thoughts se reduce el cromado. El rail no cambia de orden al cambiar el foco. Un inspector relacionado puede acompañar cuando existe espacio; no se impone en iPhone.

**iPhone — dos hipótesis que necesitan validación:**
- **B1, cinco destinos frecuentes visibles:** Isabella, Situación, Tiempo, Work y Lecturas en tab bar; Thoughts tiene un acceso **explícito de primer nivel secundario**, accesible con un toque desde una acción visible y etiquetada, no solo a través de un menú anónimo ni de un «More» automático. Debe mantenerse un camino claro de vuelta. Riesgo: Thoughts puede parecer subordinado pese a su autonomía; verificar frecuencia y accesibilidad del acceso.
- **B2, cuatro dominios + Biblioteca:** Isabella, Situación, Tiempo, Work y una sección «Biblioteca» con dos destinos claros Lecturas / Thoughts. Riesgo: equiparar incorrectamente una biblioteca de investigación con una obra visual. El agrupamiento sería puramente navegacional y no mezclaría sus modelos o apariencias.

**Ventaja:** la jerarquía se aprende una vez, permite diferencias compositivas profundas, conserva la especialización de Work y Lecturas y aprovecha componentes adaptativos de SwiftUI.

**Riesgo:** si la contextualidad de Isabella no se implementa con cuidado, el usuario saltará demasiadas veces a un chat global, perdiendo selección y contexto. Si todas las funciones avanzadas se dejan en «Más», se recreará la complejidad oculta.

**Mitigación:** contrato de retorno por entidad, acciones de «Preguntar sobre esto» con preview de contexto, acceso a revisar sin exigir reconstruir el origen, y pruebas de descubribilidad.

**Veredicto:** **recomendación provisional** para prototipos y pruebas. No aprobar todavía B1/B2 ni retirar tabs actuales.

## C · Isabella como pantalla principal y acceso a todo por conversación

**Estructura:** Chat como home permanente; Tiempo, Work, Lecturas, Ideas y artefactos aparecen como tarjetas generadas, atajos o resultados conversacionales. Las superficies se abren bajo demanda.

**Ventaja:** una sensación de asistente unificado, punto de entrada único, menos controles permanentes en la primera pantalla.

**Coste:** alta dependencia de formular peticiones, navegación menos predecible, más trabajo para examinar una semana o docenas de archivos. La conversación vuelve a ser cuello de botella para tareas estructuradas, degrada accesibilidad y limita la agencia del usuario cuando sabe exactamente qué necesita.

**Veredicto:** **descartada como estructura exclusiva**; retenemos conversación como entrada importante y preguntar como capacidad universal. La experiencia no puede obligar a hablar para utilizar funciones visibles.

## Evaluación comparativa cualitativa

| Criterio | A, estructura actual | B, estable + adaptable | C, conversación dominante |
| --- | --- | --- | --- |
| Riesgo inmediato de pérdida funcional | Bajo mientras siga WebKit | Bajo si migración con matriz y gate | Alto si se sustituyen destinos por prompts |
| Orientación entre dominios | Media: iOS duplica zonas | Potencialmente alta, pendiente test | Baja en recorridos densos |
| Trabajo simultáneo en escritorio | Alto | Alto y configurable | Bajo si se reduce a chat |
| Acceso directo a tareas especializadas | Bueno en web, dispar en iOS | Diseñable según frecuencia | Depende de mediación verbal |
| Contextualidad de Isabella | Parcial, panes coexistentes | Contrato explícito por objeto | Presente pero arriesga centralizar todo |
| Adecuación a iPhone | Puente, no resuelta | Adaptación deliberada | Limpia visualmente, débil funcionalmente |
| Complejidad de implementación | Ya existente | Moderada/alta, gradual | Alta y disruptiva |
| Respeto a Lecturas y Thoughts | Bueno, separados | Bueno si se preserva jerarquía | Débil como experiencia exclusiva |

**Decisión de diseño propuesta:** avanzar con **B como candidata**, sin desplazar A hasta pasar acceptance. La variante móvil sigue en evaluación entre B1 y B2. Ninguna simplificación permite eliminar módulos existentes o sobrescribir preferencias del usuario.

## Mapas de navegación candidatos: nivel global, local, contextual

| Destino global | Navegación local observable | Capacidad contextual transversal |
| --- | --- | --- |
| Isabella | Conversación, historial, Focus, revisiones derivadas | Abrir estado de trabajo/entidad referida con ID |
| Situación | Ahora / Ideas / propuesta o artefacto | Preguntar por evento/sugerencia con fuente y cobertura |
| Tiempo | Día / Semana / Mes / tarea / sesión | Preguntar/planificar manteniendo fecha, tarea y proyecto |
| Work | Panorama / Desktop / Planner / Conocimiento / Threads | Preguntar por documento, proyecto, claim o hilo |
| Lecturas | Biblioteca / lector / subrayados / notas / relectura | Preguntar a Sofía sobre selección y retornar al pasaje |
| Thoughts | Obra completa / controles propios | Salida clara hacia MINDS; no incrustar chat sobre la obra |

El **contexto** debe viajar como referencia tipada (por ejemplo, proyecto+documento, lectura+fragmento, tarea+fecha) y no como un bloque de texto sin trazabilidad. Su traslado a Isabella desde un dominio personal diferente requiere la autorización pertinente.

## Esbozos de composición — sin fijar pixel ni estética final

### Escritorio: Isabella focal
Rail compacto persistente | Chat central dominante | Contexto opcional (Hoy, Agenda, Plan). El usuario puede minimizar, maximizar y recuperar; los paneles no reordenan la navegación global.

### Escritorio: Tiempo o Work comparativo
Rail persistente | Área primaria extensa con semana/mes o board | Detalle como panel contextual o vista localizada. Evitar redundancia de «Hoy» y «Plan de trabajo» si ya se ve el calendario pertinente.

### Escritorio: Lecturas / Conocimiento
Rail persistente | Texto o información focal con ancho legible | Notas/inspector contextual cuando corresponda. Afirmaciones propuestas, fuentes y desconocimiento muestran jerarquía distinta.

### iPhone: actividad individual
Navegación principal familiar | Actividad única | Acciones contextualizadas y hoja/detalle bajo demanda. Volver restituye el origen. La interfaz de estado/recibo se abre desde la entidad concreta y no obliga a ir a la portada del chat.

### Thoughts
Solo envolvente de entrada/salida, con el mínimo de interfaz superpuesta. Sus propias relaciones espaciales y colores no se sustituyen por tokens de MINDS.

## Cinco preguntas de diseño que deben resolverse con prototipo y uso real

**N1. ¿Qué entra en la navegación del iPhone?** Comparar B1 y B2 en reconocimiento y recorrido, especialmente llegar a Lecturas/Thoughts desde otra actividad. No resolver por el número de iconos sino por frecuencia, significado y tasa de error.

**N2. ¿Dónde aparece «Preguntar»?** Testear un acceso global discreto y acciones contextuales; evitar dos conversaciones distintas para la misma continuidad. Preguntar sobre una selección requiere mostrar el origen compartido.

**N3. ¿Dónde se revisan las acciones?** Propuesta visual de bandeja/estado dentro del origen, más acceso global a revisiones. No separar el «aprobar» de su ID y consecuencias.

**N4. ¿Qué persiste al volver?** Selección de proyecto y subvista, carpeta, fecha/semana, lectura+ancla, hilo, borrador; diferenciar estado del dispositivo de fuente de verdad.

**N5. ¿Qué paneles simultáneos son verdaderamente útiles?** En Chat, comparar el dashboard de tres paneles con Chat+un inspector seleccionable; no presuponer que «menos paneles» siempre gana.

## Procedimiento de decisión

Diseñar dos prototipos nativos acotados con **datos de prueba representativos y sin conectar mutaciones productivas**: B1 y B2 para las mismas tres jornadas: (i) consultar el día y mover una revisión con recibo simulado distinguible; (ii) buscar PDF en Work y preguntar sobre él; (iii) abrir lectura, anotar y retomar pasaje. No introducir datos ficticios en Supabase ni confundir resultados visuales con backend real.

Registrar pasos, destinos equivocadamente elegidos, tiempo para orientación, disponibilidad de retorno, claridad de autoridad, orden VoiceOver/teclado, tamaños de texto y cobertura funcional. Test de Thoughts por separado. Elegir variante en función de observaciones y feedback explícito del propietario. Conservar A hasta demostrar la sustitución.

## Fuentes y estatus

- [Apple · Design foundations from idea to interface](https://developer.apple.com/videos/play/wwdc2025/359/) — método de estructura → navegación → contenido → forma visual.
- [Apple · Principles of great design](https://developer.apple.com/videos/play/wwdc2026/250/) — atención, agencia, claridad, familiaridad y simplicidad sin ocultar funciones.
- [Apple HIG · Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) y [Layout](https://developer.apple.com/design/human-interface-guidelines/layout).
- [MINDS · Design Language v0.1](../DESIGN-SYSTEM-v0.1.md), [Paridad iOS](IOS-FUNCTIONAL-PARITY-v0.1.md).

Los mapas B1/B2 y las valoraciones de esta página son **juicios de diseño propios**. No se atribuyen a Apple; requerirán revisión empírica y una decisión explícita antes de traducirse a arquitectura nativa de producción.

## Prototipo interactivo comparativo · 26/10/2026

Se han construido **dos maquetas navegables reales**, B1 y B2, usando exactamente los mismos datos **sintéticos**. Se pueden abrir en cualquier navegador moderno, incluido iPhone, sin cuenta de Apple Developer:

**[Abrir Design Lab B1/B2](https://gari01234.github.io/minds/isabella/design-lab/)** (`apps/isabella/design-lab/`).

Los tres recorridos seleccionables son: tarea → propuesta de cambio de fecha → cancelación o recibo explícitamente ficticio; Work → PDF con extracción parcial → consulta contextual de Isabella → retorno; y Lecturas → texto ficticio → subrayado → interpretación ficticia de Sofía → retorno. Thoughts tiene acceso directo y rotulado en B1 y aparece como destino explícito de Biblioteca en B2. Ambos estados son independientes, con contador de interacciones por variante y reinicio individual.

**Límites:** son prototipos HTML/CSS/JS autocontenidos, no builds SwiftUI ni tests de dispositivo firmado; no incluyen datos reales, sesiones, conexión a Supabase, persistencia, IA ni operaciones. Las interacciones y los «recibos» solo cambian el estado en memoria del navegador. Este sitio es público por GitHub Pages, por lo que solo contiene fixtures ficticios. No confundir la ventaja de un clic en un journey con preferencia global por B1; el resultado final requiere evaluación de todas las superficies, especialmente Thoughts. No sustituye la webapp ni implica aprobación de una variante.

La suite `tests/ios-design-lab.test.mjs` comprueba rutas, flujos, separación de variantes, cancelación, marca explícita de recibo simulado, ausencia de conectores y publicación estática. El estudio debe recibir feedback del propietario y pruebas táctiles antes de escoger navegación final o codificarla en SwiftUI.
