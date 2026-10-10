# Thoughts dentro de MINDS — contrato v0.1

Fecha: 10 de octubre de 2026.

## Alcance y relación entre obras

Dear: Thoughts es una obra original del usuario, actualmente publicada desde `gari01234/architectures/dear_thoughts.html`, descendiente del proyecto PRMTTN. Se integra deliberadamente como sexto destino de navegación principal de MINDS para contemplación recurrente durante la jornada laboral. Se conserva el nombre **Thoughts**, accesible tanto en móvil como en escritorio, después de Lecturas.

No se reproduce ni copia el motor de permutaciones, reloj, geometría, color, movimiento o admisibilidad. La fuente ejecutable permanece en Dear: Architectures. PRMTTN conserva su condición histórica y formal de antecedente; no es la fuente de esta visualización. El visualizador de MINDS es solo una ventana a la obra, sin convertirla en una función de Isabella, en un segundo ORB ni en una herramienta de bienestar con efectos garantizados.

## Contrato técnico

La vista se carga mediante un iframe creado solo al entrar en Thoughts, cuya URL apunta a la página publicada `https://gari01234.github.io/architectures/dear_thoughts.html?hide=1`. Un parámetro de apertura evita servir HTML antiguo después de publicar cambios en la fuente. El iframe se desmonta completamente al salir, liberando el contexto WebGL; al volver se inicia una nueva instancia de la obra. Cuando la página queda en segundo plano mientras la vista sigue abierta, el propio motor original suspende y reanuda su ciclo de `requestAnimationFrame`, sin salto acumulado.

La página original, no MINDS, decide su escena y su movimiento. El parámetro `hide=1` inicializa la interfaz de la obra en modo contemplación sin la doble inversión anterior. Se conservaron los controles de la obra original al visitarla por separado.

La seguridad es una frontera explícita: `sandbox="allow-scripts"` **sin** `allow-same-origin`, sin autorización de navegación superior ni mensajes entre el marco y MINDS. `referrerpolicy="no-referrer"` impide exponer la URL interna del anfitrión. Aunque ambas páginas se sirvan bajo `gari01234.github.io`, la obra se ejecuta con origen opaco y no debe poder leer almacenamiento, credenciales o estado de MINDS. No hay puente Supabase, cookies, tokens ni escritura entre sistemas. Esto puede restringir ciertos controles opcionales dentro del marco y requiere aceptación en navegador real.

Para fidelidad temporal, la obra usa la velocidad angular canónica, hasta entonces expresada por frame nominal de 60 Hz, escalada por tiempo visible transcurrido. Los huecos prolongados se acotan y una pestaña oculta no acumula rotación para recuperarla bruscamente. No se cambian las reglas combinatorias, la secuencia del reloj ni los fenotipos.

## Aceptación

Verificar en Safari iPhone/PWA y escritorio (incluido monitor pequeño): posición y tamaño del sexto icono, carga WebGL real, visibilidad limpia `hide=1`, rotación y orbitación con touch/mouse, navegación de salida y retorno sin contextos GPU persistentes, suspensión/reanudación tras bloquear el teléfono o cambiar de pestaña, comportamiento del sandbox sin errores de recursos, y actualización de la obra después de un nuevo despliegue de Architectures. Las pruebas de Node y CI verifican contratos estáticos y sintaxis, pero no equivalen a aceptación empírica de WebGL en Safari ni de carga de CDN.

No añadir monitorización del tiempo de contemplación ni introducir automáticamente preguntas de Isabella o recomendaciones de descanso. La decisión de entrar, cuánto permanecer y cómo mirar pertenece al usuario.
