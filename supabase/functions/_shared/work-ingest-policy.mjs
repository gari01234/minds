/* Pure decisions for demand-driven Docling; never infer readiness from missing data. */
export function hasDoclingWork(probes){
  if(!Array.isArray(probes)||probes.length!==4)throw new Error("invalid_work_probe");
  return probes.some(p=>Array.isArray(p?.data)&&p.data.length>0);
}
export function doclingTaskIsLost(error){
  return ["docling_result_expired","docling_task_lost","docling_task_stale"].includes(error);
}

/* Explicit operator gate, constrained to the exact held PDF reason and size.
 * Does not reactivate costly images, arbitrary failures or unrecognized files.
 */
export function heldPdfPageBatchEligible(queue,file,enabled){
  return enabled===true&&queue?.status==="waiting_parser"&&
    queue?.last_error==="pdf_page_batch_acceptance_pending"&&
    queue?.file_id===file?.id&&
    typeof file?.name==="string"&&/\.pdf$/i.test(file.name)&&
    Number.isSafeInteger(file.size_bytes)&&
    file.size_bytes>=16*1024*1024&&file.size_bytes<=48*1024*1024;
}
