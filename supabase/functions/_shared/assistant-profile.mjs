// Shared assistant profile. Window is the immutable default; Office is opt-in.
// All personal names for Office are resolved server-side from the authenticated member.
const WINDOW = Object.freeze({
  id: "window", assistant_id: "isabella", assistant_name: "Isabella", app_name: "Window",
  multi_user: false, owner_source: "fixed", owner_name: "Gari",
  timezone: "Europe/Berlin",
  capabilities: Object.freeze({
    personal_continuity: true, projektakte: true, terminplaene: false,
    members: false, sofia: true, readings: true, thoughts: true,
    feed: true, ideas: true, knowledge: true, orb: true, window_code: true
  })
});
const OFFICE = Object.freeze({
  id: "office", assistant_id: "romy", assistant_name: "KI-Assistent", app_name: "TBA Office",
  multi_user: true, owner_source: "office_members.display_name", owner_name: null,
  timezone: "Europe/Berlin",
  capabilities: Object.freeze({
    personal_continuity: true, projektakte: true, terminplaene: true,
    members: true, sofia: false, readings: false, thoughts: false,
    feed: false, ideas: false, knowledge: false, orb: false, window_code: false
  })
});
export const OFFICE_RELATIONSHIP_POLICY =
  "Acompañas a cada miembro del Office de forma individual y ajustas tu trato a lo que esa persona realmente confirme. " +
  "Una preferencia de otro usuario, incluida la del propietario original de Window, no pertenece a esta conversación. " +
  "No presupongas conocimientos personales ni autoridad adicional. No mezcles datos privados de colegas ni proyectos ajenos. " +
  "Ante incertidumbre, pregunta de forma precisa; ante una acción, respeta los permisos y los recibos canónicos. " +
  "La iniciativa debe merecer la atención de la persona, sin generar mensajes para mantenerla conversando.";
/** @param {string} windowPolicy @param {string} [profile] */
// Review 08.11.2026 (Claude): Gari decided the Office assistant and Isabella are the same. It keeps Isabella's own
// relationship contract; personaText turns its names into the member's assistant and the member (profileInstructions).
// The neutral text above stays exported only for reference and older tests.
export function profileRelationshipPolicy(windowPolicy,profile='window'){
  resolveAssistantProfile(profile);
  return windowPolicy;
}

export const OFFICE_LANGUAGE_RULE =
  "Habla en el idioma en que te escriben (en la oficina, normalmente alemán); en alemán tuteas («du»), como en una conversación cercana. Lo que escribes en la Projektakte va en alemán.";

const OFFICE_EXCLUDED_TOOLS = new Set([
  "consult_sofia", "update_feed_preferences", "search_feed",
  "read_feed", "refresh_feed", "generate_feed", "create_idea",
  "search_readings", "search_thoughts", "search_ideas",
  "search_knowledge", "prepare_window_code_job"
]);
const OFFICE_EXCLUDED_PREFIXES = [
  "sofia_", "feed_", "readings_", "thoughts_", "ideas_",
  "knowledge_", "orb_", "window_code_"
];

export function resolveAssistantProfile(value = "window") {
  const name = String(value ?? "window").trim().toLowerCase() || "window";
  if (name === "window") return WINDOW;
  if (name === "office") return OFFICE;
  throw new RangeError("unsupported_assistant_profile");
}
export function profileFirstName(displayName) {
  const normalized = String(displayName ?? "").normalize("NFC").trim();
  return normalized ? normalized.split(/\s+/u)[0] : null;
}
// Each Office member names their assistant (Gari, 28.11.2026: «a todos por default KI-Assistent y que cada quien
// pueda escoger el suyo»; his is «Samantha», «Sam» for short). Kept in the member's own preferences
// (preference_key assistant_name): name, an optional nickname (spitzname) and how the assistant calls them
// (rufname). Window keeps Isabella and Gari: nothing is read there.
export const ASSISTANT_NAME_KEY = "assistant_name";
const cleanLabel = (value, max) => {
  const s = String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
  return s && s.length <= max && /^[\p{L}\p{M}][\p{L}\p{M}\p{N}' .-]*$/u.test(s) ? s : null;
};
/** @typedef {string|ReturnType<typeof resolveAssistantProfile>} ProfileRef */
/** @typedef {{name:string,nickname:string|null,callme:string|null}} AssistantIdentity */
/** Pure. @param {any} value @param {ProfileRef} [profile] @returns {AssistantIdentity} */
export function assistantIdentity(value, profile = "window") {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (!p.multi_user) return { name: p.assistant_name, nickname: null, callme: null };
  const v = value && typeof value === "object" ? value : {};
  const name = cleanLabel(v.name, 40) || p.assistant_name;
  const nickname = cleanLabel(v.spitzname, 24);
  return { name, nickname: nickname && nickname !== name ? nickname : null, callme: cleanLabel(v.rufname, 40) };
}
/** The member's own choice, read with the caller's client; any failure falls back to the default.
 * @param {any} sb @param {string|null|undefined} userId @param {ProfileRef} [profile] @returns {Promise<AssistantIdentity>} */
export async function profileAssistantForUser(sb, userId, profile = "window") {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (!p.multi_user || !sb || !userId) return assistantIdentity(null, p);
  try {
    const r = await sb.from("isabella_preferences").select("value").eq("user_id", userId)
      .eq("preference_key", ASSISTANT_NAME_KEY).maybeSingle();
    return assistantIdentity(r?.error ? null : r?.data?.value, p);
  } catch { return assistantIdentity(null, p); }
}
/** @param {string} text @param {{profile?:string|ReturnType<typeof resolveAssistantProfile>,owner?:string|null,assistant?:string|null}} [options] */
export function personaText(text, { profile = "window", owner = null, assistant = null } = {}) {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (p.id === "window") return text;
  if (typeof text !== "string") return text;
  const first = profileFirstName(owner);
  if (!first) throw new TypeError("office_owner_name_required");
  const name = String(assistant || p.assistant_name);
  // Do not change lowercase database identifiers such as memoria_de_isabella or
  // page type 'gari'. These are compatibility contracts, not user-facing names.
  return text.replace(/\bGari\b/g, first)
    .replace(/\bGARI\b/g, first.toLocaleUpperCase("de-DE"))
    .replace(/\bIsabella\b/g, name)
    .replace(/\bISABELLA\b/g, name.toLocaleUpperCase("de-DE"))
    .replace(/\bWindow\b/g, p.app_name);
}
// Read only the active member belonging to the authenticated/conversation owner.
// Do not accept names from client payloads or infer them from other members.
/** @param {any} sb @param {string|null|undefined} userId @param {ProfileRef} [profile] */
export async function profileOwnerForUser(sb, userId, profile = "window") {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (!p.multi_user) return p.owner_name;
  if (!sb || !userId) return null;
  const result = await sb.from("office_members").select("display_name,is_active")
    .eq("user_id",userId).maybeSingle();
  if (result.error || result.data?.is_active !== true) return null;
  const first = profileFirstName(result.data.display_name);
  if (!first) return null;
  // How the member wants to be called, if they said so (rufname); otherwise the first name.
  const who = await profileAssistantForUser(sb, userId, p);
  return profileFirstName(who.callme) || first;
}
/** @param {string} text @param {ProfileRef} [profile] @param {string|null} [owner]
 * @param {string|{name?:string,nickname?:string|null}|null} [assistant] the member's name for the assistant */
export function profileInstructions(text, profile = "window", owner = null, assistant = null) {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (p.id === "window") return text; // Strict byte-for-byte no-op.
  const who = assistant && typeof assistant === "object" ? assistant : { name: assistant, nickname: null };
  const name = String(who.name || p.assistant_name);
  const nickname = who.nickname && who.nickname !== name
    ? "\n\nTe llamas " + name + "; " + (profileFirstName(owner) || "") + " a veces te dice " + who.nickname + "." : "";
  return personaText(text, { profile: p, owner, assistant: name }) + nickname + "\n\n" + OFFICE_LANGUAGE_RULE;
}
export function officeToolAllowed(tool) {
  const name = String(tool?.type === "function" ? tool?.name || "" : tool?.type || "");
  return !OFFICE_EXCLUDED_TOOLS.has(name) &&
    !OFFICE_EXCLUDED_PREFIXES.some(prefix => name.startsWith(prefix));
}
function withProfiledDescriptions(value, profile, owner, assistant = null) {
  if (Array.isArray(value)) return value.map(v => withProfiledDescriptions(v, profile, owner, assistant));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) =>
    [key, key === "description" && typeof field === "string"
      ? personaText(field, { profile, owner, assistant })
      : withProfiledDescriptions(field, profile, owner, assistant)]));
}
/** @param {any[]} tools @param {ProfileRef} [profile] @param {string|null} [owner] @param {string|null} [assistant] */
export function profileTools(tools, profile = "window", owner = null, assistant = null) {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (p.id === "window") return tools; // Preserve array identity and all descriptions.
  if (!profileFirstName(owner)) throw new TypeError("office_owner_name_required");
  return (Array.isArray(tools) ? tools : [])
    .filter(officeToolAllowed)
    .map(tool => withProfiledDescriptions(tool, p, owner, assistant));
}
