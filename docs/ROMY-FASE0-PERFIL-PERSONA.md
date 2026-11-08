# Romy = Isabella · Fase 0 · Perfil y persona

Fuente: docs/ROMY-MOTOR-ISABELLA-ENCARGO.md (08.11.2026).

## Contrato implementado (preparación, sin despliegue)
El perfil de servidor se selecciona únicamente desde ASSISTANT_PROFILE. Si la variable no existe, el modo es window. office exige un usuario autenticado y una fila activa en office_members; el nombre de pila se obtiene de display_name mediante una lectura owner-scoped, nunca del body del cliente. No se modifica el runtime ni el esquema de producción.

personaText, profileInstructions y profileTools mantienen el texto y las referencias exactamente iguales para window. La transformación office afecta instrucciones y descripciones de herramientas antes de enviarlas al proveedor, con una regla lingüística adicional y exclusión de capacidades ajenas a Office. Los identificadores internos en minúsculas siguen intactos. Se prepara un diccionario compartido de chat (es/de) y la detección bilingüe de avisos de sistema.

## Aceptación pendiente para cerrar Fase 0
Falta portar al perfil el resto de prompts de background (dream, presence, routines, runners), sustituir referencias personales residuales y enlazar todas las superficies visibles del chat con el diccionario. Por esa razón no se declara la aceptación completa y esta rama debe seguir como borrador.

No hay migraciones, funciones desplegadas ni secretos nuevos. GitHub Actions «Verify MINDS» pasó el 08.11.2026 en esta rama: 1.210 pruebas totales, 1.208 superadas, 0 fallidas, 2 omitidas; Deno check, Chromium y suites PostgreSQL efímeras en verde. La comparación del flujo real byte a byte entre despliegues sigue pendiente. El test `promptComponentSizes` con datos sintéticos arroja antes/después: instrucciones 16.055/16.163 caracteres; contexto 46/46; input 41/41; descripciones de herramientas 158/79, con 2/1 herramientas. No hay llamadas a servicios reales.

## Reversión
Revertir el commit de esta rama; la configuración por defecto window sigue intacta. office no debe activarse hasta completar la aceptación de las fases.
