/* Conservative decisions for lossy, single-use Docling async tasks.
 * No source text, remote failure messages or secrets are recorded here.
 */
export const DOC_TIMEOUT_RECHECK="docling_task_missing_once";
const lost=new Set(["docling_task_lost","docling_result_expired","docling_task_stale"]);
const terminalContent=new Set(["docling_task_failed","docling_no_readable_content","docling_conversion_failed"]);
export function costlyDocumentImage(name,sizeBytes){
  const ext=String(name||"").toLowerCase().split(".").pop();
  return ["png","jpg","jpeg"].includes(ext)&&Number(sizeBytes)>8*1024*1024;
}
export function decideDoclingFailure({reason,previousError,taskId,costlyImage,attempts}){
  const error=String(reason||"");
  if(error==="docling_task_lost"&&taskId&&previousError!==DOC_TIMEOUT_RECHECK)
    return {action:"repoll",reason:DOC_TIMEOUT_RECHECK};
  if(costlyImage&&(lost.has(error)||terminalContent.has(error)))
    return {action:"hold",reason:terminalContent.has(error)?"docling_image_conversion_failed":"docling_image_task_unavailable"};
  if(lost.has(error)&&Number(attempts)>=4)
    return {action:"hold",reason:"docling_task_unavailable"};
  return {action:"retry",reason:error};
}
