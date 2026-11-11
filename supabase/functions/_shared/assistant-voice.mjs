/* The app's own voice, in the language of the profile (11.11.2026).
 *
 * These are the fixed lines the engine writes into a conversation in the app's name: what is
 * pending, what could not be done, why a turn got no answer. They are never the assistant's own
 * words (system-notice.mjs keeps them apart in the history). Window speaks Spanish with Gari; the
 * office speaks German. Before this module the engine wrote Spanish everywhere and the Office app
 * translated the lines on screen with patterns; now the engine writes them in the right language
 * and the stored conversation says the same as the screen.
 *
 * Window's texts are byte-identical to what the engine wrote before.
 */

const ES = Object.freeze({
  prepared: "He preparado el cambio para que lo revises antes de aplicarlo.",
  direct_pending: "Creación autorizada, pendiente de comprobante.",
  unregistered: "No pude registrar una propuesta nueva y verificable para esta operación. No hay ningún cambio confirmado a partir de esta solicitud. Revisa los datos o aclara la operación para volver a intentarlo.",
  voice_card: "Hay una propuesta pendiente de confirmar.",
  reminder_prefix: "Me pediste que te recordara: ",
  busy: "Isabella está terminando la respuesta anterior. Espera a que termine antes de enviar otra.",
  stale_binding: "La solicitud ya no coincide con una decisión vigente.",
  stale_decision: "La decisión cambió o ya no necesita respuesta.",
  unverified_continuation: "No pude verificar a qué solicitud estás respondiendo. No he preparado ni cambiado ninguna tarea.",
  turn_identity: "No pude registrar una identidad verificable para este mensaje.",
  turn_persist: "No pude registrar este turno en MINDS.",
  clarification_conflict: "No pude verificar la aclaración; no he creado ningún cambio.",
  clarification_invalid: "No pude formular una aclaración verificable.",
  voice_review_failed: "No pude confirmar que la tarjeta llegara al chat.",
  failure_credit: "No se pudo responder: la cuenta de OpenAI que usa Isabella se quedó sin crédito. Cuando la recargues, vuelve a enviar el mensaje.",
  failure_empty: "No se pudo responder a este mensaje: la respuesta llegó vacía. Vuelve a enviarlo.",
  failure_incomplete: "No se pudo responder a este mensaje: la respuesta se interrumpió. Vuelve a enviarlo.",
  failure_error: "No se pudo responder a este mensaje por un error del servicio. Vuelve a enviarlo."
});

const DE = Object.freeze({
  prepared: "Die Änderung ist vorbereitet. Bitte vor dem Anwenden prüfen.",
  direct_pending: "Anlage freigegeben, Bestätigung steht noch aus.",
  unregistered: "Für diese Anfrage konnte kein prüfbarer Vorschlag angelegt werden. Es wurde nichts geändert. Bitte die Angaben prüfen oder die Anfrage genauer formulieren.",
  voice_card: "Ein Vorschlag wartet auf deine Bestätigung.",
  reminder_prefix: "Du wolltest daran erinnert werden: ",
  busy: "Romy beendet gerade die vorherige Antwort. Bitte kurz warten, bevor du die nächste Nachricht sendest.",
  stale_binding: "Die Anfrage passt nicht mehr zu einer offenen Entscheidung.",
  stale_decision: "Die Entscheidung hat sich geändert oder braucht keine Antwort mehr.",
  unverified_continuation: "Es ließ sich nicht prüfen, auf welche Anfrage du antwortest. Es wurde nichts vorbereitet oder geändert.",
  turn_identity: "Diese Nachricht konnte nicht eindeutig registriert werden.",
  turn_persist: "Diese Nachricht konnte nicht im Office gespeichert werden.",
  clarification_conflict: "Die Rückfrage konnte nicht geprüft werden; es wurde nichts geändert.",
  clarification_invalid: "Es konnte keine prüfbare Rückfrage formuliert werden.",
  voice_review_failed: "Es ließ sich nicht bestätigen, dass die Karte im Chat angekommen ist.",
  failure_credit: "Keine Antwort möglich: Das Guthaben des KI-Dienstes ist aufgebraucht. Bitte das Büro informieren.",
  failure_empty: "Keine Antwort möglich: Der KI-Dienst hat keinen Text geliefert. Bitte die Frage noch einmal stellen.",
  failure_incomplete: "Keine Antwort möglich: Die Antwort wurde unterbrochen. Bitte die Frage noch einmal stellen.",
  failure_error: "Keine Antwort möglich: Der KI-Dienst ist gerade nicht erreichbar. Bitte später noch einmal versuchen."
});

const isOffice = (profile) => String(profile?.id ?? profile ?? "window") === "office";

/** The fixed lines for a profile ("window" | "office" or the resolved profile object).
 * @param {any} [profile] */
export function appVoice(profile = "window") {
  return isOffice(profile) ? DE : ES;
}

/** Why a turn got no answer, as a line the app leaves in the conversation.
 * @param {string} kind @param {any} [profile] */
export function failureLine(kind, profile = "window") {
  const v = appVoice(profile);
  if (kind === "credit") return v.failure_credit;
  if (kind === "empty") return v.failure_empty;
  if (kind === "incomplete") return v.failure_incomplete;
  return v.failure_error;
}

const validDay = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + "T12:00:00Z")) &&
  new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;

/** «Propuesta: evento «X» para el miércoles, 11 de noviembre de 2026 (proyecto Y) · pendiente de tu
 * confirmación.» / «Vorschlag: Termin «X» · Mittwoch, 11. November 2026 (Projekt Y) · wartet auf deine
 * Bestätigung.» Null when the proposal is not a task or event being created or changed.
 * @param {any} proposal @param {any} [profile] */
export function proposalLine(proposal, profile = "window") {
  if (!proposal || !["task", "event"].includes(proposal.kind) ||
      !["create", "update"].includes(proposal.action)) return null;
  const title = String(proposal.title || proposal.target_title || "").trim();
  if (!title) return null;
  const date = String(proposal.date || "");
  const day = validDay(date) ? new Date(date + "T12:00:00Z") : null;
  const long = (locale) => new Intl.DateTimeFormat(locale, {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(day);
  if (isOffice(profile)) {
    const noun = proposal.kind === "event" ? "Termin" : "Aufgabe";
    return "Vorschlag: " + noun + " «" + title + "»" + (proposal.action === "update" ? " aktualisieren" : "") +
      (day ? " · " + long("de-DE") : "") +
      (proposal.project ? " (Projekt " + String(proposal.project) + ")" : "") +
      " · wartet auf deine Bestätigung.";
  }
  const noun = proposal.kind === "event" ? "evento" : "tarea";
  // System voice (Phase 1, step 3): the app states what is pending; it does not speak as Isabella.
  return "Propuesta: " + (proposal.action === "update" ? "actualizar " : "") + noun + " «" + title + "»" +
    (day ? " para el " + long("es-ES") : "") +
    (proposal.project ? " (proyecto " + String(proposal.project) + ")" : "") +
    " · pendiente de tu confirmación.";
}
