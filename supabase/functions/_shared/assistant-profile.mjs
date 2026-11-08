// Shared assistant profile. Window is the immutable default; Office is opt-in.
// All personal names for Office are resolved server-side from the authenticated member.
const WINDOW = Object.freeze({
  id: "window", assistant_name: "Isabella", app_name: "Window",
  multi_user: false, owner_source: "fixed", owner_name: "Gari",
  timezone: "Europe/Berlin",
  capabilities: Object.freeze({
    personal_continuity: true, projektakte: true, terminplaene: false,
    members: false, sofia: true, readings: true, thoughts: true,
    feed: true, ideas: true, knowledge: true, orb: true, window_code: true
  })
});
const OFFICE = Object.freeze({
  id: "office", assistant_name: "Romy", app_name: "TBA Office",
  multi_user: true, owner_source: "office_members.display_name", owner_name: null,
  timezone: "Europe/Berlin",
  capabilities: Object.freeze({
    personal_continuity: true, projektakte: true, terminplaene: true,
    members: true, sofia: false, readings: false, thoughts: false,
    feed: false, ideas: false, knowledge: false, orb: false, window_code: false
  })
});
export const OFFICE_RELATIONSHIP_POLICY =
  "Romy acompaña a cada miembro del Office de forma individual y ajusta su trato a lo que esa persona realmente confirme. " +
  "Una preferencia de otro usuario, incluida la del propietario original de Window, no pertenece a esta conversación. " +
  "No presupongas conocimientos personales ni autoridad adicional. No mezcles datos privados de colegas ni proyectos ajenos. " +
  "Ante incertidumbre, pregunta de forma precisa; ante una acción, respeta los permisos y los recibos canónicos. " +
  "La iniciativa debe merecer la atención de la persona, sin generar mensajes para mantenerla conversando.";
/** @param {string} windowPolicy @param {string} [profile] */
// Review 08.11.2026 (Claude): Gari decided Romy and Isabella are the same. Romy keeps Isabella's own
// relationship contract; personaText turns its names into Romy and the member (profileInstructions).
// The neutral text above stays exported only for reference and older tests.
export function profileRelationshipPolicy(windowPolicy,profile='window'){
  resolveAssistantProfile(profile);
  return windowPolicy;
}

export const OFFICE_LANGUAGE_RULE =
  "Habla en el idioma en que te escriben (en la oficina, normalmente alemán). Lo que escribes en la Projektakte va en alemán.";

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
/** @param {string} text @param {{profile?:string|ReturnType<typeof resolveAssistantProfile>,owner?:string|null,assistant?:string|null}} [options] */
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
export async function profileOwnerForUser(sb, userId, profile = "window") {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (!p.multi_user) return p.owner_name;
  if (!sb || !userId) return null;
  const result = await sb.from("office_members").select("display_name,is_active")
    .eq("user_id",userId).maybeSingle();
  return result.error || result.data?.is_active !== true
    ? null : profileFirstName(result.data.display_name);
}
/** @param {string} text @param {string} [profile] @param {string|null} [owner] */
export function profileInstructions(text, profile = "window", owner = null) {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (p.id === "window") return text; // Strict byte-for-byte no-op.
  return personaText(text, { profile: p, owner }) + "\n\n" + OFFICE_LANGUAGE_RULE;
}
export function officeToolAllowed(tool) {
  const name = String(tool?.type === "function" ? tool?.name || "" : tool?.type || "");
  return !OFFICE_EXCLUDED_TOOLS.has(name) &&
    !OFFICE_EXCLUDED_PREFIXES.some(prefix => name.startsWith(prefix));
}
function withProfiledDescriptions(value, profile, owner) {
  if (Array.isArray(value)) return value.map(v => withProfiledDescriptions(v, profile, owner));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) =>
    [key, key === "description" && typeof field === "string"
      ? personaText(field, { profile, owner })
      : withProfiledDescriptions(field, profile, owner)]));
}
/** @param {any[]} tools @param {string} [profile] @param {string|null} [owner] */
export function profileTools(tools, profile = "window", owner = null) {
  const p = typeof profile === "string" ? resolveAssistantProfile(profile) : profile;
  if (p.id === "window") return tools; // Preserve array identity and all descriptions.
  if (!profileFirstName(owner)) throw new TypeError("office_owner_name_required");
  return (Array.isArray(tools) ? tools : [])
    .filter(officeToolAllowed)
    .map(tool => withProfiledDescriptions(tool, p, owner));
}
