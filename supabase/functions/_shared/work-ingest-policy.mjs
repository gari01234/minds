/* Pure decisions for demand-driven Docling; never infer readiness from missing data. */
export function hasDoclingWork(probes){
  if(!Array.isArray(probes)||probes.length!==4)throw new Error("invalid_work_probe");
  return probes.some(p=>Array.isArray(p?.data)&&p.data.length>0);
}
export function doclingTaskIsLost(error){
  return ["docling_result_expired","docling_task_lost","docling_task_stale"].includes(error);
}
