# Cada uno nombra a su asistente (28.11.2026)

Gari: «propongo ponerle a todos por default KI-Assistent y que cada quien pueda escoger el suyo o dejarlo así». El suyo se llama **Samantha**, y a veces le dice **Sam**. Además: el asistente tutea en todo, a todos.

## En el motor (solo perfil `office`; Window no cambia)

- **Nombre por defecto:** «KI-Assistent» (`assistant_name`). El id interno de las filas guardadas sigue siendo `romy` (`assistant_id`), para no romper nada de lo ya guardado.
- **Elección de cada miembro:** está en sus propias preferencias (`isabella_preferences`, clave `assistant_name`) y tiene tres campos:
  - `name`: el nombre;
  - `spitzname`: un apodo opcional;
  - `rufname`: cómo quiere que le llame el asistente; si no lo pone, se usa su nombre de pila.

  Lo lee `profileAssistantForUser` con el cliente del que llama. Si falla la lectura, se usa «KI-Assistent».
- **Dónde se usa:**
  - las instrucciones del chat, de Live, de la presencia, del sueño y de las rutinas, con la línea «Te llamas …; … a veces te dice …»;
  - las descripciones de herramientas;
  - el título de las conversaciones nuevas.
- **Tuteo:** `OFFICE_LANGUAGE_RULE` añade «en alemán tuteas («du»)». La línea fija «… beendet gerade …» pasa a primera persona.
- **Páginas del sueño:** las páginas de la persona, de ella y de los dos se buscan por tipo, no por nombre. Así, un nombre nuevo renombra la página en lugar de crear otra.

Pruebas: `tests/asistente-nombre-propio.test.mjs` y las de las fases de Romy, actualizadas. Desplegar: `isabella-chat isabella-live-session isabella-heartbeat isabella-presence isabella-dream isabella-routine-runner`.
