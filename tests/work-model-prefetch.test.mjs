import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sourceFirstWorkPrefetchEligible,deferredSourceFirstProjectModel} from "../supabase/functions/_shared/work-model-prefetch.mjs";

const work={work:true,project:"Bernried"};
const check=(message,extra={})=>sourceFirstWorkPrefetchEligible({route:work,message,...extra});
const realQuestion="Necesito una comparación documental lo más completa posible de todas las superficies identificadas como «Caféraum» en el proyecto Bernried. Examina los planos, presentaciones y versiones disponibles. No te limites a los primeros resultados: revisa las páginas relevantes de los documentos.";
test("real Bernried user source comparison is evidence-first, no project-model prefetch",()=>{
 assert.equal(check(realQuestion),true);
 assert.equal(check("Examina los planos y verifica las superficies de todas las variantes disponibles."),true);
 assert.equal(check("Compare all source documents, drawing versions, and page references."),true);
 assert.equal(check("Vergleiche alle Unterlagen und Grundrissvarianten."),true);
});
test("personal chat, calendars, project-model questions, mutations, attachments, and Work Threads retain complete context",()=>{
 assert.equal(sourceFirstWorkPrefetchEligible({route:{work:false,project:"Bernried"},message:realQuestion}),false);
 assert.equal(sourceFirstWorkPrefetchEligible({route:{work:true,project:""},message:realQuestion}),false);
 assert.equal(check("¿Qué acordamos en el proyecto Bernried?"),false);
 assert.equal(check("Revisa y compara los movimientos del modelo de proyecto en los documentos."),false);
 assert.equal(check("Compara el Project Model y las relaciones con los planos."),false);
 for(const flags of [{background:true},{fastAgenda:true},{workThread:true},{materialDeliverable:true},{attachments:1}])
   assert.equal(check(realQuestion,flags),false,JSON.stringify(flags));
});
test("deferred marker is explicit and cannot claim originals inspected",()=>{
 const m=deferredSourceFirstProjectModel();
 assert.equal(m.status,"deferred");
 assert.equal(m.source_originals_verified,false);
 assert.equal(m.recover_with,"search_work");
 assert.equal(JSON.stringify(m).includes("project claim"),false);
});
test("only automatic Work prefetch skips expensive governed Project Model RPC",()=>{
 const edge=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
 assert.match(edge,/sourceFirstWorkPrefetchEligible\(\{route,message:effectiveMessage/);
 assert.match(edge,/args\?\._deferProjectModel\?Promise.resolve\(\{data:null,error:null\}\):sb\.rpc\("minds_project_model_snapshot"/);
 assert.match(edge,/_deferProjectModel:sourceFirstWorkPrefetch,_admitSourceRows:/);
 assert.match(edge,/project_model:args\?\._deferProjectModel\?deferredSourceFirstProjectModel\(\):projectModel\|\|null/);
 assert.match(edge,/work_project_model_prefetch=sourceFirstWorkPrefetch\?"deferred_source_first":"full"/);
 assert.match(edge,/name:"find_work_occurrences"/);
 assert.match(edge,/name:"browse_work_sources"/);
});
