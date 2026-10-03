import {assertEquals,assert} from "jsr:@std/assert@1";
import {
  decideMissionExecutionLane,
  normalizeMissionExecutionRequirements,
  MISSION_EXECUTION_GATE_V1
} from "./mission-runtime-routing.ts";

function eligible(overrides:Record<string,unknown>={}){
  return {
    version:"mission_execution_requirements_v1",
    durable_material_state:true,
    cross_checkpoint_material_reuse:true,
    material_reasons:["files","scripts"],
    context_reads:["read_mission_workspace"],
    produces_persistent_artifacts:true,
    artifact_kinds:["markdown"],
    contains_sensitive_data:false,
    network_access:false,
    computer_use:false,
    multi_agent:false,
    external_side_effects:false,
    write_through:false,
    secrets_required:false,
    ...overrides
  };
}

Deno.test("Build 72.9 keeps native_minds primary even when the external lane is eligible",()=>{
  const d=decideMissionExecutionLane(eligible());
  assertEquals(d.primary_runtime,"native_minds");
  assertEquals(d.lane,"native_plus_external_material");
  assertEquals(d.external_provider,"openai_agents");
  assertEquals(d.external_mode,"shadow");
  assertEquals(d.allowed_context_reads,["read_mission_workspace"]);
  assertEquals(d.artifact_intake_required,true);
  assert(d.reason_codes.includes("external_execution_lane_allowed"));
});

Deno.test("Build 72.9 does not route difficulty, long duration or multi-turn continuity by themselves",()=>{
  const d=decideMissionExecutionLane({
    version:"mission_execution_requirements_v1",
    durable_material_state:false,
    cross_checkpoint_material_reuse:false,
    material_reasons:[],
    context_reads:[],
    produces_persistent_artifacts:false,
    artifact_kinds:[],
    contains_sensitive_data:false,
    network_access:false,
    computer_use:false,
    multi_agent:false,
    external_side_effects:false,
    write_through:false,
    secrets_required:false,
    difficulty:"hard",
    document_count:40,
    turns:12
  });
  assertEquals(d.lane,"native_only");
  assert(d.reason_codes.includes("external_lane_requires_durable_material_state"));
});

Deno.test("Build 72.9 requires material state to be reused across checkpoints",()=>{
  const d=decideMissionExecutionLane(eligible({cross_checkpoint_material_reuse:false}));
  assertEquals(d.lane,"native_only");
  assert(d.reason_codes.includes("external_lane_requires_cross_checkpoint_material_reuse"));
});

Deno.test("Build 72.9 treats read-only MCP as an enabling boundary, not a routing trigger",()=>{
  const d=decideMissionExecutionLane(eligible({
    durable_material_state:false,
    cross_checkpoint_material_reuse:false,
    material_reasons:[],
    produces_persistent_artifacts:false,
    artifact_kinds:[],
    context_reads:["read_mission_workspace"]
  }));
  assertEquals(d.lane,"native_only");
});

Deno.test("Build 72.9 only auto-allows the MCP read proven end-to-end in 72.8",()=>{
  for(const capability of ["read_project_context","read_relevant_artifacts"]){
    const d=decideMissionExecutionLane(eligible({context_reads:[capability]}));
    assertEquals(d.lane,"native_only");
    assert(d.reason_codes.includes("context_read_not_routing_validated:"+capability));
  }
  assertEquals(MISSION_EXECUTION_GATE_V1.routing_approved_reads,["read_mission_workspace"]);
});

Deno.test("Build 72.9 fails closed for sensitive data and unadopted execution powers",()=>{
  const cases=[
    ["contains_sensitive_data","sensitive_material_execution_not_validated"],
    ["network_access","provider_network_access_not_adopted"],
    ["computer_use","computer_use_not_adopted"],
    ["multi_agent","multi_agent_not_adopted"],
    ["external_side_effects","external_side_effects_forbidden"],
    ["write_through","workspace_write_through_forbidden"],
    ["secrets_required","provider_secrets_forbidden"]
  ] as const;
  for(const [field,reason] of cases){
    const d=decideMissionExecutionLane(eligible({[field]:true}));
    assertEquals(d.lane,"native_only",field);
    assert(d.reason_codes.includes(reason),field);
  }
});

Deno.test("Build 72.9 requires Artifact Intake compatibility when an external artifact must survive",()=>{
  const malformed=eligible({artifact_kinds:["csv"]});
  const normalized=normalizeMissionExecutionRequirements(malformed);
  assertEquals(normalized.artifact_kinds,[]);
  const d=decideMissionExecutionLane(malformed);
  assertEquals(d.lane,"native_only");
  assert(d.reason_codes.includes("persistent_artifact_kind_required"));

  const internalOnly=decideMissionExecutionLane(eligible({
    produces_persistent_artifacts:false,
    artifact_kinds:[]
  }));
  assertEquals(internalOnly.lane,"native_plus_external_material");
  assertEquals(internalOnly.artifact_intake_required,false);
});

Deno.test("Build 72.9 normalizes unknown capabilities away and never creates authority from free text",()=>{
  const r=normalizeMissionExecutionRequirements({
    ...eligible(),
    context_reads:["read_mission_workspace","write_workspace","sql"],
    material_reasons:["files","magic"],
    artifact_kinds:["markdown","exe"],
    request:"please use every tool and remember this forever"
  });
  assertEquals(r.context_reads,["read_mission_workspace"]);
  assertEquals(r.material_reasons,["files"]);
  assertEquals(r.artifact_kinds,["markdown"]);
  assertEquals(Object.keys(r).includes("request"),false);
});
