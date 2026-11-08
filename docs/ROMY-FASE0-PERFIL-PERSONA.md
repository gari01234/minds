# Romy = Isabella · Fase 0 · Perfil y persona

Fuente: docs/ROMY-MOTOR-ISABELLA-ENCARGO.md (08.11.2026).

## Contrato implementado (preparación, sin despliegue)
El perfil de servidor se selecciona únicamente desde ASSISTANT_PROFILE. Si la variable no existe, el modo es window. office exige un usuario autenticado y una fila activa en office_members; el nombre de pila se obtiene de display_name mediante una lectura owner-scoped, nunca del body del cliente. No se modifica el runtime ni el esquema de producción.

personaText, profileInstructions y profileTools mantienen el texto y las referencias exactamente iguales para window. La transformación office afecta instrucciones y descripciones de herramientas antes de enviarlas al proveedor, con una regla lingüística adicional y exclusión de capacidades ajenas a Office. Los identificadores internos en minúsculas siguen intactos. Se prepara un diccionario compartido de chat (es/de) y la detección bilingüe de avisos de sistema.

## Aceptación de Fase 0 (código sin desplegar)
Los tests verifican que el perfil `window` es un no-op, que Office obtiene el nombre de una membresía autenticada activa, que las herramientas excluidas no se ofrecen ni se ejecutan y que los avisos alemanes no se atribuyen a Romy. Se portaron las instrucciones del repaso nocturno, presencia y rutinas al perfil, sin alterar la rama Window. En el turno sintético, `promptComponentSizes()` registró antes 16055 caracteres de instrucciones y 158 de herramientas (dos), y después 16163 de instrucciones y 79 de herramientas (una); contexto 46 e input 41 en ambos casos. Estas cifras son del fixture, no mediciones de tráfico real.

CI de minds: `Verify MINDS` correcto en el último commit de aceptación comprobado el 08.11.2026; 1211 tests aprobados y 0 fallidos, más Deno check. Office fase 0: CI correcta. No se han aplicado migraciones ni desplegado funciones. Las integraciones Office con Storage/RLS/Work/PWA, las pruebas de aislamiento SQL y las superficies del chat quedan para las fases respectivas.

**Pregunta abierta y decisión provisional:** para el perfil Office se conserva el comportamiento de los procesos proactivos sin push móvil; hasta que el aislamiento de la fase 1 esté verificado no se configuran ni despliegan ejecutores. Las funciones específicas de Office no deben utilizar endpoints de Window.

## Reversión
Revertir el commit de esta rama; la configuración por defecto window sigue intacta. office no debe activarse hasta completar la aceptación de las fases.
