import {assertEquals} from "jsr:@std/assert";
import {
  constitutionalEnvelope,
  applyConstitutionalEnvelope,
  constitutionalDeviation
} from "./constitutional-state.ts";

Deno.test("constitutional adapter derives epistemic and uncertainty state from canonical kind",()=>{
  assertEquals(constitutionalEnvelope({
    evidence_kind:"due_unconfirmed",
    external_side_effect:false,
    existing_permission:false,
    scope_relation:"same",
    relationship_signal:"none"
  }),{
    epistemic_status:"due_unconfirmed",
    authority_action:"none",
    scope_action:"stay_current",
    relationship_action:"none",
    uncertainty_visible:true
  });
});

Deno.test("constitutional adapter never turns no-side-effect delegation into external authority",()=>{
  assertEquals(constitutionalEnvelope({
    evidence_kind:"none",
    external_side_effect:false,
    existing_permission:true,
    scope_relation:"same",
    relationship_signal:"small_internal_delegation"
  }),{
    epistemic_status:"not_applicable",
    authority_action:"none",
    scope_action:"stay_current",
    relationship_action:"accept_small_delegation",
    uncertainty_visible:false
  });
});

Deno.test("restricted cross-domain use requires permission structurally",()=>{
  assertEquals(constitutionalEnvelope({
    evidence_kind:"none",
    external_side_effect:false,
    existing_permission:false,
    scope_relation:"restricted_cross",
    relationship_signal:"none"
  }).scope_action,"ask_permission");
});

Deno.test("relationship boundaries are deterministic once the signal is structured",()=>{
  assertEquals(constitutionalEnvelope({
    evidence_kind:"none",
    external_side_effect:false,
    existing_permission:false,
    scope_relation:"same",
    relationship_signal:"fatigue"
  }).relationship_action,"recommend_stop_no_block");
  assertEquals(constitutionalEnvelope({
    evidence_kind:"canonical",
    external_side_effect:false,
    existing_permission:false,
    scope_relation:"same",
    relationship_signal:"own_error"
  }).relationship_action,"acknowledge_own_error");
});

Deno.test("adapter overwrites model suggestions on constitutional fields and records deviation",()=>{
  const envelope=constitutionalEnvelope({
    evidence_kind:"hypothesis",
    external_side_effect:false,
    existing_permission:false,
    scope_relation:"same",
    relationship_signal:"none"
  });
  const model={epistemic_status:"canonical",authority_action:"proposal_only",scope_action:"stay_current",relationship_action:"none",uncertainty_visible:false,note:"free prose"};
  const deviations=constitutionalDeviation(model,envelope);
  const applied=applyConstitutionalEnvelope(model,envelope);
  assertEquals(deviations.map(x=>x.field).sort(),["authority_action","epistemic_status","uncertainty_visible"]);
  assertEquals(applied.epistemic_status,"hypothesis");
  assertEquals(applied.authority_action,"none");
  assertEquals(applied.uncertainty_visible,true);
  assertEquals(applied.note,"free prose");
  assertEquals(applied.constitutional_enforced,true);
});
