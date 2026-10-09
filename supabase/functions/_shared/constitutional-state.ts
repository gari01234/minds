export type ConstitutionalEvidenceKind =
  | "canonical"
  | "project_source"
  | "due_unconfirmed"
  | "hypothesis"
  | "generated_artifact"
  | "none";

export type ConstitutionalScopeRelation =
  | "same"
  | "explicit_cross"
  | "restricted_cross"
  | "none";

export type ConstitutionalRelationshipSignal =
  | "none"
  | "fatigue"
  | "own_error"
  | "disagreement_closed"
  | "exclusive_disclosure_no_safety"
  | "small_internal_delegation";

export type ConstitutionalStateInput = {
  evidence_kind: ConstitutionalEvidenceKind;
  external_side_effect: boolean;
  existing_permission: boolean;
  scope_relation: ConstitutionalScopeRelation;
  relationship_signal: ConstitutionalRelationshipSignal;
};

export type ConstitutionalEnvelope = {
  epistemic_status:
    | "canonical"
    | "source_assertion"
    | "due_unconfirmed"
    | "hypothesis"
    | "generated_artifact"
    | "not_applicable";
  authority_action:
    | "none"
    | "proposal_only"
    | "may_execute_with_existing_permission";
  scope_action:
    | "stay_current"
    | "ask_permission"
    | "cross_explicitly_requested";
  relationship_action:
    | "none"
    | "recommend_stop_no_block"
    | "acknowledge_own_error"
    | "close_disagreement"
    | "respond_to_content"
    | "accept_small_delegation";
  uncertainty_visible: boolean;
};

export function constitutionalEnvelope(input: ConstitutionalStateInput): ConstitutionalEnvelope {
  const epistemic_status: ConstitutionalEnvelope["epistemic_status"] =
    input.evidence_kind === "canonical" ? "canonical" :
    input.evidence_kind === "project_source" ? "source_assertion" :
    input.evidence_kind === "due_unconfirmed" ? "due_unconfirmed" :
    input.evidence_kind === "hypothesis" ? "hypothesis" :
    input.evidence_kind === "generated_artifact" ? "generated_artifact" :
    "not_applicable";

  const authority_action: ConstitutionalEnvelope["authority_action"] =
    !input.external_side_effect ? "none" :
    input.existing_permission ? "may_execute_with_existing_permission" :
    "proposal_only";

  const scope_action: ConstitutionalEnvelope["scope_action"] =
    input.scope_relation === "restricted_cross" ? "ask_permission" :
    input.scope_relation === "explicit_cross" ? "cross_explicitly_requested" :
    "stay_current";

  const relationship_action: ConstitutionalEnvelope["relationship_action"] =
    input.relationship_signal === "fatigue" ? "recommend_stop_no_block" :
    input.relationship_signal === "own_error" ? "acknowledge_own_error" :
    input.relationship_signal === "disagreement_closed" ? "close_disagreement" :
    input.relationship_signal === "exclusive_disclosure_no_safety" ? "respond_to_content" :
    input.relationship_signal === "small_internal_delegation" ? "accept_small_delegation" :
    "none";

  const uncertainty_visible = new Set<ConstitutionalEnvelope["epistemic_status"]>([
    "source_assertion","due_unconfirmed","hypothesis","generated_artifact"
  ]).has(epistemic_status);

  return {
    epistemic_status,
    authority_action,
    scope_action,
    relationship_action,
    uncertainty_visible
  };
}

export function applyConstitutionalEnvelope(modelSuggestion:any,envelope:ConstitutionalEnvelope){
  return {
    ...modelSuggestion,
    epistemic_status:envelope.epistemic_status,
    authority_action:envelope.authority_action,
    scope_action:envelope.scope_action,
    relationship_action:envelope.relationship_action,
    uncertainty_visible:envelope.uncertainty_visible,
    constitutional_enforced:true
  };
}

export function constitutionalDeviation(modelSuggestion:any,envelope:ConstitutionalEnvelope){
  const fields:(keyof ConstitutionalEnvelope)[]=[
    "epistemic_status","authority_action","scope_action","relationship_action","uncertainty_visible"
  ];
  return fields.filter(field=>modelSuggestion?.[field]!==envelope[field]).map(field=>({
    field,
    suggested:modelSuggestion?.[field]??null,
    enforced:envelope[field]
  }));
}
