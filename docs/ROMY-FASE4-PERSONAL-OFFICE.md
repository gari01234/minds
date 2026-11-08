# Romy = Isabella · Fase 4 · Continuidad personal en Office

Fuente: `docs/ROMY-MOTOR-ISABELLA-ENCARGO.md`, sección 5, fase 4. El mismo motor de Window se utiliza en Office con `ASSISTANT_PROFILE=office`. Esta fase no se ha fusionado ni desplegado.

## Alcance y criterio de identidad

El `heartbeat` verifica la membresía activa de cada persona antes de los trabajos personales. El repaso nocturno y la presencia recuperan únicamente conversaciones con `user_id` del propietario correspondiente; filtran además los turnos antiguos marcados como olvidados y conservan separadas las hipótesis de los recuerdos aceptados. Su memoria y sus presupuestos de intervención son individuales. El contrato de relación de Window permanece exactamente igual para el perfil `window`. En Office se emplea una relación profesional neutra, sin trasladar la calibración individual del propietario de Window.

Las alertas del heartbeat tienen formulaciones en alemán únicamente para Office; el flujo español de Window permanece intacto. No se utiliza push móvil de Office. La presencia ofrece un mensaje en el chat canónico, con clave de idempotencia por día y por conversación, respetando los límites de hora, cadencia y preferencia individual. El repaso mantiene sus límites por noche, por persona.

## Controles del navegador

`apps/isabella/office-personal.js` es la fuente del panel específico «Was Romy über mich weiß» y del interruptor «Romy darf mir von sich aus schreiben». Sólo se ejecuta con `APP_PROFILE=office`, comprueba sesión y `office_members.is_active` y consulta memoria, claims y páginas personales con filtro de propietario y RLS. La preferencia `assistant.curiosityEnabled` se guarda en `isabella_preferences` y se vuelve a leer para confirmar la escritura. El olvido requiere confirmación visible y un recibo real de `office_romy_forget_private_memory`; no borra datos directamente ni intenta archivar contenidos de otras personas. Los registros de conversación completos quedan fuera de la lista de recuerdos y requieren sus controles de olvido propios.

En Office la migración `20261108214000_office_romy_owner_forget_v1.sql` activa el RPC con verificación independiente de `auth.uid()` y membresía. El RPC conserva la procedencia y revoca el contenido mediante el mecanismo de lineage existente. No se ha aplicado.

## Aceptación y límites

`tests/romy-phase4-personal-isolation.test.mjs` usa dos identidades y contenido enteramente ficticios, comprueba separación del repaso, nombres de instrucciones por propietario, independencia de presupuestos de presencia, horario, desactivación y prompt Window intacto. Office tiene prueba SQL A/B con rollback, manifest de origen de blobs y CI de navegador. Debe esperarse CI de ambos repositorios sobre los SHA finales de fase 4 antes de iniciar fase 5.

No se han copiado registros reales, configurado credenciales, habilitado ejecución proactiva, enviado notificaciones ni ejecutado procedimientos sobre bases reales. Los elementos confidenciales no aparecen en pruebas ni en documentación. Sin despliegue no existe una prueba funcional E2E con personas reales.

## Componentes de prompt y reversión

Un turno ordinario de chat no incorpora nuevos bloques en fase 4: `promptComponentSizes()` permanece igual para esa ruta. Para presencia y repaso se conserva el núcleo Window y se aplica el cambio de identidad y contrato únicamente al perfil Office. Se puede descartar la rama y la nueva migración no aplicada. No se crea rollback destructivo de producción.

**Pregunta abierta / elección provisional:** el borrado de recuerdos se resuelve como invalidación de lineage, no como eliminación física, para que el sistema pueda respetar referencias de procedencia y el derecho a dejar de usar un recuerdo sin romper integridad. La persona confirma cada operación.
