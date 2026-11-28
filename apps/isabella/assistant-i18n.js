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
      change: "el cambio",
      system_notice_short: "Aviso",
      assistant_label: "Isabella",
      you: "Tú",
      replying_to: "Respondiendo a",
      cancel_reply: "Cancelar respuesta",
      review_pending: "Revisar propuesta pendiente",
      partial_reply: "Respuesta interrumpida. El texto recibido es parcial.",
      continue_reply: "Continuar respuesta",
      reaction_change: "Cambiar reacción",
      react: "Reaccionar",
      reply_message: "Responder a este mensaje",
      source: "Fuente",
      review_cancelled: "Propuesta cancelada. No se aplicó el cambio.",
      review_locally: "Hecho. Échale un vistazo para comprobar que quedó como querías.",
      chat_thinking: "Pensando…",
      chat_preparing: "Isabella está preparando la respuesta…",
      chat_answering: "Isabella está respondiendo…",
      chat_working: "Isabella sigue trabajando…",
      chat_failed: "Isabella no pudo terminar esta respuesta. Puedes intentarlo de nuevo.",
      memory_night: "Repaso de la noche",
      memory_understands: "Lo que Isabella entiende",
      memory_threads: "Hilos que quiere retomar",
      memory_empty: "Aún nada.",
      memory_own_none: "Ninguno ahora.",
      memory_dismiss: "Descartar",
      memory_cancel: "Cancelar",
      memory_recap_empty: "Todavía no hay un repaso nocturno.",
      memory_self: "Cómo me he sentido",
      memory_clear: "Borrar estas notas",
      presence_switch: "Isabella puede escribirme primero (como mucho una vez al día, solo si vale la pena)",
      focus_review: "Revisa la transcripción",
      focus_send: "Enviar",
      focus_repeat: "Repetir",
      focus_listening: "Escuchando…",
      focus_stop: "Detener",
      focus_cancel: "Cancelar",
      focus_transcribing: "Transcribiendo…",
      focus_close: "Cerrar",
      focus_write: "Escribir",
      focus_unavailable: "Voz no disponible",
      focus_unavailable_help: "Puedes seguir escribiendo.",
      focus_not_understood: "No entendí el audio",
      focus_failed: "No pude transcribir",
      focus_error_help: "Inténtalo de nuevo.",
      focus_empty: "No escuché audio",
      focus_microphone: "No pude iniciar el micrófono",
      focus_permission: "Revisa el permiso del micrófono o escribe el mensaje.",
      undo_failed: "No pude confirmar Deshacer. Comprueba tus tareas y calendario antes de volver a intentarlo."
    }),
    de: Object.freeze({
      system_notice: "Hinweis der App",
      review_confirm: "Bestätigen",
      review_discard: "Verwerfen",
      undo: "Rückgängig",
      undo_done: "Rückgängig gemacht.",
      memory_title: "Was {wer} über mich weiß",
      presence_enabled: "{Wer} darf mir zuerst schreiben",
      listening: "Ich höre zu…",
      sending: "Wird an {wen} gesendet…",
      voice_error: "Die Spracheingabe konnte nicht transkribiert werden.",
      save_unverified: "Die Speicherung konnte nicht bestätigt werden; keine Änderung wird als ausgeführt angezeigt.",
      saved: "Gespeichert.",
      saved_many: "Änderungen gespeichert.",
      prepared_many: "Änderungen vorbereitet · warten auf deine Bestätigung.",
      pending_review: "wartet auf deine Bestätigung.",
      task: "die Aufgabe",
      event: "der Termin",
      change: "die Änderung",
      system_notice_short: "Hinweis",
      assistant_label: "{name}",
      you: "Du",
      replying_to: "Antwort an",
      cancel_reply: "Antwort abbrechen",
      review_pending: "Vorschlag prüfen",
      partial_reply: "Antwort unterbrochen. Der erhaltene Text ist unvollständig.",
      continue_reply: "Antwort fortsetzen",
      reaction_change: "Reaktion ändern",
      react: "Reagieren",
      reply_message: "Auf diese Nachricht antworten",
      source: "Quelle",
      review_cancelled: "Vorschlag verworfen. Keine Änderung ausgeführt.",
      review_locally: "Erledigt. Bitte prüfe, ob das Ergebnis stimmt.",
      chat_thinking: "{Wer} denkt nach…",
      chat_preparing: "{Wer} bereitet die Antwort vor…",
      chat_answering: "{Wer} antwortet…",
      chat_working: "{Wer} arbeitet noch…",
      chat_failed: "{Wer} konnte diese Antwort nicht abschließen. Du kannst es erneut versuchen.",
      memory_night: "Nächtlicher Rückblick",
      memory_understands: "Was {wer} verstanden hat",
      memory_threads: "Themen für später",
      memory_empty: "Noch nichts.",
      memory_own_none: "Gerade keine.",
      memory_dismiss: "Verwerfen",
      memory_cancel: "Abbrechen",
      memory_recap_empty: "Noch kein nächtlicher Rückblick vorhanden.",
      memory_self: "Wie es mir ging",
      memory_clear: "Diese Notizen löschen",
      presence_switch: "{Wer} darf mir zuerst schreiben (höchstens dreimal am Tag, werktags von 7:30 bis 19 Uhr, nur wenn es sich lohnt)",
      focus_review: "Transkription überprüfen",
      focus_send: "Senden",
      focus_repeat: "Wiederholen",
      focus_listening: "Ich höre zu…",
      focus_stop: "Stopp",
      focus_cancel: "Abbrechen",
      focus_transcribing: "Wird transkribiert…",
      focus_close: "Schließen",
      focus_write: "Schreiben",
      focus_unavailable: "Spracheingabe nicht verfügbar",
      focus_unavailable_help: "Du kannst weiter schreiben.",
      focus_not_understood: "Keine Sprache erkannt",
      focus_failed: "Transkription fehlgeschlagen",
      focus_error_help: "Bitte erneut versuchen.",
      focus_empty: "Keine Aufnahme erkannt",
      focus_microphone: "Mikrofon konnte nicht gestartet werden",
      focus_permission: "Mikrofonberechtigung prüfen oder Nachricht schreiben.",
      undo_failed: "Rückgängig konnte nicht bestätigt werden. Bitte prüfe Aufgaben und Kalender vor einem weiteren Versuch."
    })
  });
  const locale = root.APP_PROFILE === "office" ? "de" : "es";
  // Office: each member names the assistant (28.11.2026); «KI-Assistent» until they do. In a sentence that default
  // is a noun and takes its article («mit dem KI-Assistenten»); a chosen name does not («mit Samantha»).
  // Templates: {name} the bare name (labels), {Wer}/{wer} who (at the start / inside a sentence), {wem} to whom,
  // {wen} whom. office-personal.js keeps the name (MINDS_ASSISTANT_NAME and, for other pages, the cached copy).
  const DEFAULT_NAME = "KI-Assistent";
  const DEFAULT_FORMS = Object.freeze({name: DEFAULT_NAME, Wer: "Der KI-Assistent", wer: "der KI-Assistent",
    wem: "dem KI-Assistenten", wen: "den KI-Assistenten"});
  const NAME_TOKENS = /\{(name|Wer|wer|wem|wen)\}/g;
  const cleanName = (value) => {
    const s = String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
    return s && s.length <= 40 && /^[\p{L}\p{M}][\p{L}\p{M}\p{N}' .-]*$/u.test(s) ? s : "";
  };
  const chosenName = () => {
    try { if (typeof root.MINDS_ASSISTANT_NAME === "function") return cleanName(root.MINDS_ASSISTANT_NAME()); } catch {}
    try { return cleanName(JSON.parse(root.localStorage?.getItem("minds-assistant-name") || "null")?.name); } catch { return ""; }
  };
  const assistantText = (template) => {
    const name = chosenName(), own = !!name && name !== DEFAULT_NAME;
    return String(template ?? "").replace(NAME_TOKENS, (_, k) => own ? name : DEFAULT_FORMS[k]);
  };
  if (root.APP_PROFILE === "office") root.MINDS_ASSISTANT_TEXT = assistantText;
  root.ASSISTANT_I18N = Object.freeze({
    locale,
    t(key) {
      const text = dictionary[locale][key] ?? dictionary.es[key] ?? String(key);
      if (typeof text !== "string" || !text.includes("{")) return text;
      return root.APP_PROFILE === "office" ? assistantText(text) : text;
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
