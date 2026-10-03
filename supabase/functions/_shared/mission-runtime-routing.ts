export type RuntimeReadCapability=
  |"read_mission_workspace"
  |"read_relevant_artifacts"
  |"read_project_context";

export type MaterialStateReason=
  |"files"
  |"scripts"
  |"transformations"
  |"intermediate_artifacts";

export type PersistentArtifactKind="image"|"docx"|"pdf"|"markdown";

export type MissionExecutionRequirementsV1={
  version:"mission_execution_requirements_v1";
  durable_material_state:boolean;
  cross_checkpoint_material_reuse:boolean;
  material_reasons:MaterialStateReason[];
  context_reads:RuntimeReadCapability[];
  produces_persistent_artifacts:boolean;
  artifact_kinds:PersistentArtifactKind[];
  contains_sensitive_data:boolean;
  network_access:boolean;
  computer_use:boolean;
  multi_agent:boolean;
  external_side_effects:boolean;
  write_through:boolean;
  secrets_required:boolean;
};

export type MissionExecutionDecisionV1={
  version:"mission_execution_decision_v1";
  primary_runtime:"native_minds";
  lane:"native_only"|"native_plus_external_material";
  external_provider:"openai_agents"|null;
  external_mode:"shadow"|null;
  allowed_context_reads:RuntimeReadCapability[];
  artifact_intake_required:boolean;
  reason_codes:string[];
  requirements:MissionExecutionRequirementsV1;
};

const MATERIAL_REASONS=new Set<MaterialStateReason>([
  "files","scripts","transformations","intermediate_artifacts"
]);
const READ_CAPABILITIES=new Set<RuntimeReadCapability>([
  "read_mission_workspace","read_relevant_artifacts","read_project_context"
]);

// Build 72.8 proved this capability end-to-end on a real Mission.
// The other read-only tools exist at the MCP boundary but remain outside
// automatic routing until each is separately validated with real context.
const ROUTING_APPROVED_READS=new Set<RuntimeReadCapability>([
  "read_mission_workspace"
]);

const ARTIFACT_KINDS=new Set<PersistentArtifactKind>([
  "image","docx","pdf","markdown"
]);

function bool(v:unknown){return v===true}
function list<T extends string>(v:unknown,allowed:Set<T>):T[]{
  if(!Array.isArray(v))return [];
  const out:T[]=[];
  for(const x of v){
    const value=String(x||"") as T;
    if(allowed.has(value)&&!out.includes(value))out.push(value);
  }
  return out;
}

export function normalizeMissionExecutionRequirements(
  input:unknown
):MissionExecutionRequirementsV1{
  const x=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  return {
    version:"mission_execution_requirements_v1",
    durable_material_state:bool(x.durable_material_state),
    cross_checkpoint_material_reuse:bool(x.cross_checkpoint_material_reuse),
    material_reasons:list(x.material_reasons,MATERIAL_REASONS),
    context_reads:list(x.context_reads,READ_CAPABILITIES),
    produces_persistent_artifacts:bool(x.produces_persistent_artifacts),
    artifact_kinds:list(x.artifact_kinds,ARTIFACT_KINDS),
    contains_sensitive_data:bool(x.contains_sensitive_data),
    network_access:bool(x.network_access),
    computer_use:bool(x.computer_use),
    multi_agent:bool(x.multi_agent),
    external_side_effects:bool(x.external_side_effects),
    write_through:bool(x.write_through),
    secrets_required:bool(x.secrets_required)
  };
}

export function decideMissionExecutionLane(input:unknown):MissionExecutionDecisionV1{
  const r=normalizeMissionExecutionRequirements(input);
  const reasons:string[]=[];

  if(!r.durable_material_state)reasons.push("external_lane_requires_durable_material_state");
  if(!r.cross_checkpoint_material_reuse)reasons.push("external_lane_requires_cross_checkpoint_material_reuse");
  if(r.material_reasons.length===0)reasons.push("external_lane_requires_material_reason");

  if(r.contains_sensitive_data)reasons.push("sensitive_material_execution_not_validated");
  if(r.network_access)reasons.push("provider_network_access_not_adopted");
  if(r.computer_use)reasons.push("computer_use_not_adopted");
  if(r.multi_agent)reasons.push("multi_agent_not_adopted");
  if(r.external_side_effects)reasons.push("external_side_effects_forbidden");
  if(r.write_through)reasons.push("workspace_write_through_forbidden");
  if(r.secrets_required)reasons.push("provider_secrets_forbidden");

  for(const capability of r.context_reads){
    if(!ROUTING_APPROVED_READS.has(capability)){
      reasons.push("context_read_not_routing_validated:"+capability);
    }
  }

  if(r.produces_persistent_artifacts&&r.artifact_kinds.length===0){
    reasons.push("persistent_artifact_kind_required");
  }

  const blocked=reasons.length>0;
  if(blocked){
    return {
      version:"mission_execution_decision_v1",
      primary_runtime:"native_minds",
      lane:"native_only",
      external_provider:null,
      external_mode:null,
      allowed_context_reads:[],
      artifact_intake_required:false,
      reason_codes:reasons,
      requirements:r
    };
  }

  return {
    version:"mission_execution_decision_v1",
    primary_runtime:"native_minds",
    lane:"native_plus_external_material",
    external_provider:"openai_agents",
    external_mode:"shadow",
    allowed_context_reads:r.context_reads,
    artifact_intake_required:r.produces_persistent_artifacts,
    reason_codes:[
      "durable_material_state_proven",
      "cross_checkpoint_material_reuse_required",
      "external_execution_lane_allowed"
    ],
    requirements:r
  };
}

export const MISSION_EXECUTION_GATE_V1=Object.freeze({
  primary_runtime:"native_minds" as const,
  external_provider:"openai_agents" as const,
  external_mode:"shadow" as const,
  routing_approved_reads:Object.freeze([...ROUTING_APPROVED_READS]),
  artifact_intake_kinds:Object.freeze([...ARTIFACT_KINDS])
});
