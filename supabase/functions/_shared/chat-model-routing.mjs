// Window · which OpenAI model answers a turn.
// Luna answers everyday turns: fast and cheap. Terra answers where a wrong or missed
// detail costs more: complex turns, normal and complex turns inside a Work Thread,
// and reading or comparing project documents. Background turns stay on Luna so that
// routines never raise the bill on their own.
// Secrets: OPENAI_MODEL overrides Luna (as before), OPENAI_DEEP_MODEL overrides Terra.
// Setting OPENAI_DEEP_MODEL=gpt-5.6-luna switches Terra off without a deploy.
export const FAST_MODEL="gpt-5.6-luna";
export const DEEP_MODEL="gpt-5.6-terra";

const clean=value=>String(value||"").trim();
export function fastModel(env){return clean(env&&env.OPENAI_MODEL)||FAST_MODEL}
export function deepModel(env){return clean(env&&env.OPENAI_DEEP_MODEL)||DEEP_MODEL}

// complexity comes from the router (light | standard | deep); depth from the turn budget.
export function chatTurnModel({complexity,depth,workThread,background,env}={}){
  if(background)return {model:fastModel(env),tier:"fast",reason:"background"};
  if(complexity==="deep"||depth==="deep")return {model:deepModel(env),tier:"deep",reason:"complex_turn"};
  if(workThread&&complexity==="standard")return {model:deepModel(env),tier:"deep",reason:"work_thread"};
  return {model:fastModel(env),tier:"fast",reason:workThread?"work_thread_quick":"everyday_turn"};
}

// Reading, extracting from and comparing project documents in Work.
export function documentModel(env){return deepModel(env)}
