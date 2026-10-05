import {assertEquals} from "jsr:@std/assert@1";
import {boundedPersistentCheckpoints,normalizeMaterialRequest,normalizePersistentWait,persistentWorkTrace} from "./persistent-work.ts";

Deno.test("persistent time waits are future bounded and deterministic",()=>{
  const now=Date.parse("2026-10-05T08:00:00Z");
  assertEquals(normalizePersistentWait({kind:"time",wake_at:"2026-10-05T09:00:00Z"},now),{
    kind:"time",ref:null,wake_at:"2026-10-05T09:00:00.000Z"
  });
  assertEquals(normalizePersistentWait({kind:"time",wake_at:"2026-10-05T07:00:00Z"},now),null);
  assertEquals(normalizePersistentWait({kind:"time",wake_at:"2027-02-01T09:00:00Z"},now),null);
});

Deno.test("persistent dependency waits require an explicit reference",()=>{
  assertEquals(normalizePersistentWait({kind:"capability",ref:"abc"}),{kind:"capability",ref:"abc",wake_at:null});
  assertEquals(normalizePersistentWait({kind:"expectation",ref:"exp"}),{kind:"expectation",ref:"exp",wake_at:null});
  assertEquals(normalizePersistentWait({kind:"expectation"}),null);
});

Deno.test("material requests stay bounded to general execution outputs",()=>{
  assertEquals(normalizeMaterialRequest({
    title:"Teilnehmerliste",objective:"Preparar lista editable e imprimible",desired_outputs:["pdf","docx","exe","pdf"]
  }),{title:"Teilnehmerliste",objective:"Preparar lista editable e imprimible",desired_outputs:["pdf","docx"]});
});

Deno.test("persistent work trace contains identity, never instructions or authority",()=>{
  assertEquals(persistentWorkTrace({commitment_id:"c",workspace_id:"w",mission_run_id:"m",instruction:"secret",authority:"allow"}),{
    commitment_id:"c",workspace_id:"w",mission_run_id:"m",version:"persistent-work-v0.1"
  });
});

Deno.test("persistent checkpoints remain bounded",()=>{
  assertEquals(boundedPersistentCheckpoints(100),32);
  assertEquals(boundedPersistentCheckpoints(0),1);
  assertEquals(boundedPersistentCheckpoints(undefined),12);
});
