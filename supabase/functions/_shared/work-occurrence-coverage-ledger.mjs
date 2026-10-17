// Deterministic, content-free coverage status for a read-only, version-pinned
// Work occurrence search. Never treats searched text as original-image coverage.
// Events are admitted SQL-tool receipts, NOT user/model assertions.
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const fingerprint=x=>typeof x==="string"&&/^[a-f0-9]{32}$/.test(x);
export function summarizeWorkOccurrenceCoverage(events){
  const groups=new Map(),issues=[];
  for(const [index,row] of (Array.isArray(events)?events:[]).entries()){
    if(index>=80){issues.push("event_limit_reached");break}
    const project=typeof row?.project_id==="string"?row.project_id:null;
    if(row?.status!=="ok"){
      issues.push(String(row?.status||"unknown").slice(0,50));
      continue;
    }
    if(!project||!fingerprint(row.fingerprint)||!integer(row.offset)||
      !integer(row.total)||!integer(row.returned)||typeof row.has_more!=="boolean"||
      (row.next_offset!==null&&!integer(row.next_offset))){
      issues.push("invalid_page_receipt");continue;
    }
    const key=project+"|"+row.fingerprint;
    if(!groups.has(key))groups.set(key,{project_id:project,fingerprint:row.fingerprint,total:row.total,pages:[]});
    groups.get(key).pages.push({offset:row.offset,returned:row.returned,total:row.total,
      has_more:row.has_more,next_offset:row.next_offset});
  }
  const scopes=[];
  for(const g of groups.values()){
    const pages=g.pages.sort((a,b)=>a.offset-b.offset);
    let cursor=0,consistent=true,reason=null;
    const visited=new Set();
    for(const p of pages){
      if(visited.has(p.offset)){consistent=false;reason="duplicate_page";break}
      visited.add(p.offset);
      if(p.total!==g.total||p.offset!==cursor||
        p.offset+p.returned>g.total||
        (g.total>cursor&&p.returned===0)||
        p.has_more!==(p.offset+p.returned<g.total)||
        (p.has_more?p.next_offset!==p.offset+p.returned:p.next_offset!==null)){
        consistent=false;reason="invalid_or_missing_page";break
      }
      cursor+=p.returned;
    }
    const complete=consistent&&cursor===g.total&&pages.length>0;
    scopes.push({project_id:g.project_id,fingerprint:g.fingerprint,total:g.total,
      admitted:cursor,page_count:pages.length,complete,
      status:complete?"complete":consistent?"partial":"inconsistent",
      ...(reason?{reason}:{})});
  }
  return {status:issues.length?"incomplete":scopes.length===0?"not_queried":
    scopes.every(s=>s.complete)?"complete":"incomplete",
    scope:"current_extracted_text_matching_explicit_terms_only",
    full_originals_verified:false,
    queried_scopes:scopes.length,scopes,issues};
}
