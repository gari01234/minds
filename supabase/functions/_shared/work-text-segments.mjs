/* Deterministic, source-preserving segments for Work retrieval.
 * Extracted text is untrusted evidence, never a confirmed project claim.
 * This module has no database access and can be unit-tested in Node.
 */
const MAX_SEGMENTS=250, MAX_CHARS=5400;
const clean=value=>String(value??"").replace(/\u0000/g,"").trim();
function blocks(text){
  const value=clean(text),out=[];
  for(let i=0;i<value.length;i+=MAX_CHARS)out.push(value.slice(i,i+MAX_CHARS));
  return out;
}
export function fromSheetRows(sheets,{truncated=false}={}){
  const segments=[];let truncatedResult=truncated,rowsTotal=0;
  for(const sheet of sheets){
    const name=clean(sheet.name).slice(0,125)||"Sheet";
    let buffer=[],begin=null,end=null,chars=0;
    const flush=()=>{
      if(!buffer.length)return;
      if(segments.length>=MAX_SEGMENTS){truncatedResult=true;buffer=[];return}
      segments.push({segment_no:segments.length,segment_kind:"sheet_rows",
        locator:{sheet:name,row_start:begin,row_end:end,verified:true},
        content:buffer.join("\n")});
      buffer=[];begin=null;end=null;chars=0;
    };
    for(const row of sheet.rows||[]){
      rowsTotal++;
      const rowId=Number(row.row);
      if(!Number.isSafeInteger(rowId)||rowId<1){truncatedResult=true;continue}
      const cells=(row.cells||[]).map(c=>clean(c.address)+": "+clean(c.text))
        .filter(v=>v.length>2);
      const record=("Row "+rowId+" | "+cells.join(" | ")).trim();
      if(record.length<7)continue;
      for(const chunk of blocks(record)){
        if(buffer.length&&(chars+chunk.length+1>MAX_CHARS||buffer.length>=18))flush();
        if(begin===null)begin=rowId;
        end=rowId;buffer.push(chunk);chars+=chunk.length+1;
      }
    }
    flush();
  }
  return {segments,coverage:truncatedResult?"partial_text":"complete_text",
    locator_class:"worksheet_rows",metadata:{sheets:sheets.length,source_rows:rowsTotal,truncated:truncatedResult}};
}
export function fromDoclingDocument(markdown,doc,{partial=false}={}){
  const pageItems=new Map(),loose=[],seen=[];
  const append=(text,provs)=>{
    const s=clean(text);if(!s)return;
    const page=Array.isArray(provs)?provs.find(p=>Number.isInteger(Number(p?.page_no))&&Number(p.page_no)>0)?.page_no:null;
    const n=page===undefined||page===null?null:Number(page);
    if(n===null){loose.push(s);return}
    if(!pageItems.has(n))pageItems.set(n,[]);
    pageItems.get(n).push(s);seen.push(n);
  };
  if(doc&&typeof doc==="object"){
    for(const t of (Array.isArray(doc.texts)?doc.texts:[]))append(t?.text,t?.prov);
    for(const t of (Array.isArray(doc.tables)?doc.tables:[])){
      const cells=Array.isArray(t?.data?.table_cells)?t.data.table_cells:[];
      const printed=cells.slice(0,2000).map(c=>{
        const row=Number(c?.start_row_offset_idx);
        const col=Number(c?.start_col_offset_idx);
        return "r"+(Number.isFinite(row)?row+1:"?")+"c"+(Number.isFinite(col)?col+1:"?")+": "+clean(c?.text);
      }).filter(x=>x.length>6).join(" | ");
      append(printed,t?.prov);
    }
  }
  const segments=[];
  let truncated=partial,locatorClass="pdf_page";
  if(pageItems.size){
    for(const page of [...pageItems.keys()].sort((a,b)=>a-b)){
      const text=pageItems.get(page).join("\n");
      for(const part of blocks(text)){
        if(segments.length>=MAX_SEGMENTS){truncated=true;break}
        segments.push({segment_no:segments.length,segment_kind:"page_text",
          locator:{page,verified:true},content:part});
      }
    }
    // Docling's page-anchored JSON can omit headings, lists or captions still
    // present in the Markdown export. Preserve those words for search without
    // assigning an invented page. Prefer the whole Markdown as a recoverable
    // fallback when it contains content not represented by page-anchored text.
    const canonical=v=>clean(v).replace(/\s+/g," ").toLocaleLowerCase();
    const pageText=[...pageItems.values()].flat().join(" ");
    const markdownFallback=clean(markdown);
    const fallback=markdownFallback&&!canonical(pageText).includes(canonical(markdownFallback))
      ?markdownFallback:loose.join("\n");
    if(fallback.trim()){
      truncated=true; // unverified material forbids complete page coverage
      for(const part of blocks(fallback)){
        if(segments.length>=MAX_SEGMENTS){truncated=true;break}
        segments.push({segment_no:segments.length,segment_kind:"unpaged_text",
          locator:{page_verified:false,sequence:segments.length+1},content:part});
      }
    }
  }else{
    locatorClass="unverified_page";
    truncated=true; // No verified page provenance: never claim complete page-addressable coverage.
    for(const part of blocks(markdown)){
      if(segments.length>=MAX_SEGMENTS){truncated=true;break}
      segments.push({segment_no:segments.length,segment_kind:"unpaged_text",
        locator:{page_verified:false,sequence:segments.length+1},content:part});
    }
  }
  return {segments,coverage:truncated?"partial_text":"complete_text",
    locator_class:locatorClass,metadata:{verified_pages:pageItems.size,unlocated_elements:loose.length,
      unverified_segments:segments.filter(s=>s.segment_kind==="unpaged_text").length,
      markdown_chars:clean(markdown).length,truncated}};
}
