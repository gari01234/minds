// One dictionary for the shared browser chat. Office selects German explicitly.
(function (root) {
  "use strict";
  const dictionary = Object.freeze({
    es: Object.freeze({
      system_notice: "Aviso de la app",
      review_confirm: "Confirmar",
      review_discard: "Descartar",
      undo: "Deshacer",
      undo_done: "Deshecho.",
      memory_title: "Lo que Isabella sabe de mí",
      presence_enabled: "Isabella puede escribirme primero",
      listening: "Escuchando…",
      sending: "Enviando a Isabella…",
      voice_error: "No se pudo transcribir el audio.",
      save_unverified: "No se pudo comprobar que esto se guardara; no se da por hecho.",
      saved: "Guardado.",
      saved_many: "cambios guardados.",
      prepared_many: "cambios preparados · pendientes de tu confirmación.",
      pending_review: "pendiente de tu confirmación.",
      task: "la tarea",
      event: "el evento",
      change: "el cambio"
    }),
    de: Object.freeze({
      system_notice: "Hinweis der App",
      review_confirm: "Bestätigen",
      review_discard: "Verwerfen",
      undo: "Rückgängig",
      undo_done: "Rückgängig gemacht.",
      memory_title: "Was Romy über mich weiß",
      presence_enabled: "Romy darf mir zuerst schreiben",
      listening: "Ich höre zu…",
      sending: "Wird an Romy gesendet…",
      voice_error: "Die Spracheingabe konnte nicht transkribiert werden.",
      save_unverified: "Die Speicherung konnte nicht bestätigt werden; keine Änderung wird als ausgeführt angezeigt.",
      saved: "Gespeichert.",
      saved_many: "Änderungen gespeichert.",
      prepared_many: "Änderungen vorbereitet · warten auf deine Bestätigung.",
      pending_review: "wartet auf deine Bestätigung.",
      task: "die Aufgabe",
      event: "der Termin",
      change: "die Änderung"
    })
  });
  const locale = root.APP_PROFILE === "office" ? "de" : "es";
  root.ASSISTANT_I18N = Object.freeze({
    locale,
    t(key) {
      return dictionary[locale][key] ?? dictionary.es[key] ?? String(key);
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
