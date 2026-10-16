// Bounded navigation of *existing* owner-scoped current-version Work sources.
// Pure helpers are shared with deterministic tests; no retrieval ranking changes.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function boundedInt(value,fallback,max){
  if(value===undefined||value===null||value==="")return fallback;
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
}
export function workBrowseRequest(args={}){
  const file_id=typeof args.file_id==="string"?args.file_id.trim():"";
  const segmentSupplied=args.segment_no!==undefined&&args.segment_no!==null;
  if(file_id&&!UUID.test(file_id))return {status:"invalid",reason:"invalid_file_id"};
  if(!file_id&&(segmentSupplied||args.expected_version))return {status:"invalid",reason:"file_id_required"};
  const mode=!file_id?"catalog":segmentSupplied?"segment_text":"segments";
  const max=mode==="catalog"?50:8;
  const size=boundedInt(args.limit,mode==="catalog"?40:8,max);
  const offset=boundedInt(args.offset,0,1000000);
  const segment_no=segmentSupplied?boundedInt(args.segment_no,0,1000000):null;
  const version=typeof args.expected_version==="string"?args.expected_version.trim():"";
  if(version&&!/^[a-f0-9]{64}$/i.test(version))return {status:"invalid",reason:"invalid_source_version"};
  if(size===null||size<1||offset===null||segmentSupplied&&segment_no===null)return {status:"invalid",reason:"invalid_pagination"};
  return {status:"ok",mode,file_id:file_id||null,segment_no,offset,limit:size,expected_version:version||null};
}
export function workBrowsePage(rows=[],total=0,offset=0,limit=8){
  const count=Number.isSafeInteger(total)&&total>=0?total:0;
  const list=Array.isArray(rows)?rows:[];
  const more=offset+list.length<count;
  return {offset,limit,total:count,returned:list.length,has_more:more,next_offset:more?offset+list.length:null,
    // A later page alone never proves the caller examined the preceding pages.
    complete_single_page:offset===0&&!more&&list.length===count};
}
export function workBrowseSegmentView(row){
  const content=String(row?.content||"");
  return {
    file_id:row.file_id,source_version:row.source_version,segment_no:row.segment_no,
    segment_kind:row.segment_kind,locator:row.locator,extractor:row.extractor,
    excerpt:content.slice(0,8000),excerpt_truncated:content.length>8000,
    segment_chars:content.length,evidential_status:"extracted_original_text_not_confirmed"
  };
}
export function workBrowseTextView(row,offset){
  const content=String(row?.content||"");
  const text=content.slice(offset,offset+12000);
  const more=offset+text.length<content.length;
  return {
    file_id:row.file_id,source_version:row.source_version,segment_no:row.segment_no,
    segment_kind:row.segment_kind,locator:row.locator,extractor:row.extractor,
    content:text,text_offset:offset,segment_chars:content.length,has_more:more,
    next_text_offset:more?offset+text.length:null,evidential_status:"extracted_original_text_not_confirmed"
  };
}
