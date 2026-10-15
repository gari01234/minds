import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("apps/isabella/work.js");
const worker=read("supabase/functions/isabella-work-ingest-runner/index.ts");
const start=ui.indexOf("function workKnowledgeStatus(file)");
const end=ui.indexOf("\nasync function renderDesktop()",start);
assert.ok(start>0&&end>start);
const status=runInNewContext(ui.slice(start,end)+"\nworkKnowledgeStatus");
test("Work presents truthful independent claim and text extraction status",()=>{
  const file=(coverage,structured_text)=>({index_status:"indexed",metadata:{knowledge_intake:{coverage,structured_text}}});
  assert.equal(status(file("claims_only",{status:"not_supported"})),"Claims propuestos · texto aún no extraído");
  assert.equal(status(file("claims_only",{status:"needs_review",reason:"docling_http_404"})),"Claims conservados · texto pendiente de revisión");
  assert.equal(status(file("partial_docling_text",{status:"materialized",coverage:"partial_text"})),"Texto parcial recuperable · sin confirmar");
  assert.equal(status(file("docling_text_to_claims",{status:"materialized",coverage:"complete_text"})),"Texto recuperable · sin confirmar");
  assert.equal(status({index_status:"queued"}),"Lectura pendiente");
  assert.match(status({index_status:"waiting_parser"}),/Pendiente/);
  assert.match(status({index_status:"failed"}),/No se pudo leer/);
});
test("terminal enrichment failure preserves Claims but stores explicit text debt",()=>{
  assert.match(worker,/\.select\("name,size_bytes,metadata"\)/);
  assert.match(worker,/const enriched=job\.parser_name==="docling_enrichment"/);
  assert.match(worker,/structured_text:\{status:"needs_review",reason:decision\.reason/);
  assert.match(worker,/\}:\{index_status:terminalStatus,updated_at:now\}/);
  assert.doesNotMatch(worker,/if\(terminal&&job\.parser_name!=="docling_enrichment"\)/);
});
