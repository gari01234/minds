import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canonicalOccurrenceTerms,pinWorkOccurrenceContinuation,rememberWorkOccurrenceFirstPage} from "../supabase/functions/_shared/work-occurrence-continuation.mjs";
const fp="0123456789abcdef0123456789abcdef",differentFp="abcdef0123456789abcdef0123456789";
const first={status:"ok",fingerprint:fp,offset:0,terms:["caféraum","luftraum caféraum"],total:74};
test("server first page establishes per-turn canonical terms for its exact SQL cursor",()=>{
 const m=new Map();
 assert.equal(rememberWorkOccurrenceFirstPage(first,m),true);
 assert.deepEqual(m.get(fp),["caféraum","luftraum caféraum"]);
 assert.equal(rememberWorkOccurrenceFirstPage({...first,offset:50},m),false);
 assert.equal(rememberWorkOccurrenceFirstPage({...first,status:"version_changed"},m),false);
});
test("model term drift on page 2 restores the first page query rather than invalidating an unchanged corpus",()=>{
 const m=new Map();rememberWorkOccurrenceFirstPage(first,m);
 const userArgs={project:"Bernried",offset:50,expected_fingerprint:fp,terms:["Caféraum"]};
 const pinned=pinWorkOccurrenceContinuation(userArgs,m);
 assert.equal(pinned.restored,true);
 assert.deepEqual(pinned.args.terms,["caféraum","luftraum caféraum"]);
 assert.deepEqual(userArgs.terms,["Caféraum"],"never mutate original model call");
});
test("reordering, casing and duplicate terms are equivalent; no silent new search on unknown cursor",()=>{
 const m=new Map();rememberWorkOccurrenceFirstPage(first,m);
 const same=pinWorkOccurrenceContinuation({offset:50,expected_fingerprint:fp,terms:["Luftraum Caféraum","caféraum","Caféraum"]},m);
 assert.equal(same.restored,false);
 const unknown=pinWorkOccurrenceContinuation({offset:50,expected_fingerprint:differentFp,terms:["different"]},m);
 assert.equal(unknown.restored,false);
 assert.deepEqual(unknown.args.terms,["different"]);
 assert.equal(pinWorkOccurrenceContinuation({offset:0,expected_fingerprint:fp,terms:["different"]},m).restored,false);
 assert.equal(pinWorkOccurrenceContinuation({offset:50,expected_fingerprint:"bad",terms:["different"]},m).restored,false);
 assert.deepEqual(canonicalOccurrenceTerms(["b","a","B"]),["a","b"]);
});
test("continuation pinning preserves owner-scoped tool, true errors and source coverage audit",()=>{
 const source=readFileSync(new URL("../supabase/functions/isabella-chat/index.ts",import.meta.url),"utf8");
 assert.match(source,/const occurrenceInitialTerms=new Map<string,string\[\]>\(\)/);
 assert.match(source,/pinWorkOccurrenceContinuation\(args,occurrenceInitialTerms\)/);
 assert.match(source,/rememberWorkOccurrenceFirstPage\(result,occurrenceInitialTerms\)/);
 assert.match(source,/continuation_terms_restored:pinned.restored/);
 assert.match(source,/const result=await findWorkOccurrences\(req,\{\.\.\.pinned.args,/);
 assert.match(source,/status:result\?\.status/);
});
