/* Source text is separately versioned from Source-First Claims.
 * Claims can be absent while original text remains searchable with locators.
 */
import {fromSheetRows,fromDoclingDocument} from "./work-text-segments.mjs";
async function readWorkbook(bytes:Uint8Array){
  if(bytes.length>16*1024*1024)throw new Error("xlsx_too_large_for_edge_parser");
  const module=await import("npm:exceljs@4.4.0");
  const ExcelJS:any=module.default||module;
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(bytes as any)}
  catch(e){throw new Error("xlsx_load:"+String(e instanceof Error?e.message:e).slice(0,140))}
  const safeCellText=(cell:any)=>{
    const v=cell.value;
    if(v===null||v===undefined)return "";
    if(typeof v==="string"||typeof v==="number"||typeof v==="boolean")return String(v);
    if(v instanceof Date)return v.toISOString();
    if(Array.isArray(v.richText))return v.richText.map((p:any)=>String(p?.text||"")).join("");
    if(v.result!==undefined)return v.result===null?"":String(v.result);
    if(typeof v.text==="string")return v.text;
    // Unknown structured cell value is not evidence: never stringify an object.
    return "";
  };
  const sheets:any[]=[];
  let truncated=false,totalRows=0;
  for(const ws of workbook.worksheets){
    if(sheets.length>=32){truncated=true;break}
    const rows:any[]=[];
    try{ws.eachRow({includeEmpty:false},(row:any,rowNumber:number)=>{
      if(totalRows>=4000){truncated=true;return}
      const cells:any[]=[];
      row.eachCell({includeEmpty:false},(cell:any)=>{
        if(cells.length>=128){truncated=true;return}
        const val=safeCellText(cell).trim();
        if(!val)return;
        if(val.length>2500)truncated=true;
        cells.push({address:String(cell.address||""),text:val.slice(0,2500)});
      });
      if(cells.length){rows.push({row:rowNumber,cells});totalRows++}
    });
    }catch(e){throw new Error("xlsx_sheet:"+String(e instanceof Error?e.message:e).slice(0,140))}
    sheets.push({name:ws.name,rows});
  }
  return fromSheetRows(sheets,{truncated});
}
export async function materializeWorkSourceText(sb:any,file:any,bytes:Uint8Array,version:string,converted:any){
  const extension=String(file.name||"").toLowerCase().split(".").pop()||"";
  const supported=extension==="xlsx"||!!converted&&["pdf","docx","pptx","png","jpg","jpeg"].includes(extension);
  if(!supported)return {status:"not_supported"};
  const {data:existing,error:priorError}=await sb.from("minds_work_source_text_receipts")
    .select("id,coverage,segment_count,locator_class").eq("file_id",file.id)
    .eq("source_version",version).limit(1).maybeSingle();
  if(priorError)throw new Error("source_text_receipt_check_failed");
  if(existing)return {status:"materialized",coverage:existing.coverage,
    segments:existing.segment_count,locator_class:existing.locator_class,reused:true};
  const output=extension==="xlsx"?await readWorkbook(bytes)
    :fromDoclingDocument(converted.markdown,converted.document,{partial:converted.partial});
  if(!output.segments.length)return {status:"not_readable"};
  const parser=extension==="xlsx"?"exceljs-4.4.0":"docling-serve";
  const {data,error}=await sb.rpc("minds_commit_work_source_segments",{
    p_user_id:file.user_id,p_project_id:file.project_id,p_file_id:file.id,
    p_source_version:version,p_extractor:parser,
    p_coverage:output.coverage,p_locator_class:output.locator_class,
    p_metadata:output.metadata,p_segments:output.segments
  });
  if(error||!["completed","already_materialized"].includes(String(data?.status||"")))
    throw new Error("source_text_commit_failed:"+String(error?.message||data?.status||"unknown").slice(0,120));
  return {status:"materialized",coverage:output.coverage,segments:output.segments.length,
    locator_class:output.locator_class,reused:data?.status==="already_materialized"};
}
