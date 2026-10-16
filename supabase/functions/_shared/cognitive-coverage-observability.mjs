/* Observability only. Never persist original text, excerpts, prompts or source filenames.
 * These receipts describe admission into an Isabella turn, NOT model use or truth.
 */
export function contextSectionSizes(context) {
  const sections = {};
  if (context && typeof context === "object" && !Array.isArray(context)) {
    for (const [key, value] of Object.entries(context)) {
      const serialized = JSON.stringify(value);
      sections[key] = {
        chars: typeof serialized === "string" ? serialized.length : 0,
        items: Array.isArray(value) ? value.length : null
      };
    }
  }
  return { version: "component_chars_v1", sections };
}

function uuid(value) {
  const s=String(value||"");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
function version(value) {
  const s=String(value||"");
  return /^[a-zA-Z0-9_:.\-]{1,128}$/.test(s) ? s : null;
}
function int(value) {
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
const allowedStages = new Set(["routed_work", "tool_search_work"]);
export function workSourceAdmission(stage, rows) {
  const passages=Array.isArray(rows)?rows:[];
  return {
    stage:allowedStages.has(stage)?stage:"unknown",
    kind:"work_segment_admission",
    status:"loaded",
    segment_count:passages.length,
    // The original row carries a segment number, unlike the shortened model-visible excerpt.
    sources:passages.slice(0,16).map(row=>({
      file_id:uuid(row?.file_id),
      source_version:version(row?.source_version),
      segment_no:int(row?.segment_no),
      page:int(row?.locator?.page),
      page_verified:int(row?.locator?.page)>0 && (row?.locator?.verified===true || (row?.locator?.verified==null && row?.locator?.page_verified===true))
    })).filter(row=>row.file_id!==null)
  };
}
const allowedTools = new Set(["read_work_file", "consult_sofia", "search_memory"]);
export function toolAdmission(tool, result, fileId=null, stage="explicit_tool") {
  const kind=allowedTools.has(tool)?tool:"unknown";
  const status=String(result?.status||"unknown");
  return {
    stage:stage==="routed_context"?"routed_context":"explicit_tool",
    kind,
    status:/^[a-z_]{1,48}$/.test(status)?status:"unknown",
    // A file-read tool consults an original. It does not establish page-level support.
    file_id:kind==="read_work_file"?uuid(result?.file?.id||fileId):null,
    source_version:null,
    locator_verified:false,
    items:kind==="search_memory"
      ? {lexical:Array.isArray(result?.lexical)?result.lexical.length:0,
         semantic:Array.isArray(result?.semantic)?result.semantic.length:0,
         entities:Array.isArray(result?.entities)?result.entities.length:0}
      : null
  };
}
