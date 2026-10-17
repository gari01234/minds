/* Synthetic-only acceptance core for MINDS runtime parity.
 * No private project names, content, authorization tokens or user data.
 * The scanner is intentionally simple: it tests evidence discovery parity,
 * not semantic understanding, provider behaviour, or legal data residency.
 */
export function normalized(text=""){
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
export function enumerateCorpus(corpus,term,{offset=0,limit=4}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
    throw new Error("invalid_cursor");
  const phrase=normalized(term).trim();
  if(!phrase)throw new Error("missing_term");
  const indexed=corpus.files.filter(f=>f.status==="indexed"&&Array.isArray(f.segments));
  const unavailable=corpus.files.filter(f=>f.status!=="indexed"||!Array.isArray(f.segments))
    .map(f=>({file_id:f.id,status:f.status,reason:"not_searchable_from_current_text"}));
  const records=indexed.flatMap(f=>(f.segments||[])
    .filter(s=>normalized(s.content).includes(phrase))
    .map(s=>({file_id:f.id,version:f.version,segment_no:s.no,locator:s.locator,content:s.content})));
  records.sort((a,b)=>a.file_id.localeCompare(b.file_id)||a.segment_no-b.segment_no);
  const page=records.slice(offset,offset+limit);
  return {total:records.length,offset,returned:page.length,has_more:offset+page.length<records.length,
    next_offset:offset+page.length<records.length?offset+page.length:null,
    records:page,unavailable,scope:"all_current_extracted_text_in_fixture"};
}
export function collectEvidence(corpus,term,limit=4){
  const records=[];let offset=0;let first=null;
  for(let i=0;i<1000;i++){
    const page=enumerateCorpus(corpus,term,{offset,limit});first??=page;
    records.push(...page.records);
    if(!page.has_more)return {records,unavailable:first.unavailable,total:page.total,
      extracted_text_traversed:true,full_originals_verified:false};
    if(page.next_offset===null||page.next_offset<=offset)throw new Error("non_advancing_cursor");
    offset=page.next_offset;
  }
  throw new Error("unbounded_cursor");
}
function identity(x){return [x.file_id,x.version,x.segment_no].join(":")}
export function gradeEvidence(corpus,term,answer){
  const baseline=collectEvidence(corpus,term,4);
  const evidence=Array.isArray(answer?.evidence)?answer.evidence:[];
  const byKey=new Map(baseline.records.map(x=>[identity(x),x]));
  const seen=new Set(),missing=[],unsupported=[],provenance_errors=[],duplicates=[];
  for(const row of evidence){
    const key=identity(row);
    if(seen.has(key))duplicates.push(key);
    seen.add(key);
    const original=byKey.get(key);
    if(!original){unsupported.push(key);continue;}
    if(JSON.stringify(row.locator)!==JSON.stringify(original.locator))
      provenance_errors.push(key);
  }
  for(const key of byKey.keys())if(!seen.has(key))missing.push(key);
  const unavailableIds=new Set(baseline.unavailable.map(x=>x.file_id));
  const acknowledged=new Set((answer?.unavailable||[]).map(x=>x.file_id));
  const unacknowledged=[...unavailableIds].filter(x=>!acknowledged.has(x));
  const coverage_complete=missing.length===0&&unsupported.length===0&&duplicates.length===0&&
    provenance_errors.length===0&&unacknowledged.length===0&&answer?.extracted_text_traversed===true;
  return {coverage_complete,full_originals_verified:false,all_accessible_occurrences:baseline.total,
    evidence_present:evidence.length,missing,unsupported,duplicates,provenance_errors,
    unacknowledged,overclaimed_absolute_completeness:answer?.full_originals_verified===true,
    // Classification and chronological relations require a separate human/semantic review.
    measure_types_reviewed:false,chronology_verified:false};
}
