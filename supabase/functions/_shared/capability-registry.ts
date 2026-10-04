export const CAPABILITY_REGISTRY_VERSION="minds-capabilities-v0.1";

export const CAPABILITY_REGISTRY=Object.freeze({
  general_execution:Object.freeze({
    id:"general_execution",
    layer:"capability",
    provider:"openai_responses",
    tools:Object.freeze(["code_interpreter"]),
    authority:"material_output_only",
    background:true,
    network:"disabled",
    persistent_outputs:true,
    output_kinds:Object.freeze(["docx","pdf","xlsx","pptx","csv","zip","html","txt","json"]),
    principle:"Create or transform a usable material deliverable when the user's goal should end in a file rather than a chat explanation."
  }),
  image_generation:Object.freeze({
    id:"image_generation",
    layer:"capability",
    provider:"openai_images",
    tools:Object.freeze(["image_generation"]),
    authority:"material_output_only",
    background:false,
    persistent_outputs:true,
    output_kinds:Object.freeze(["image"]),
    principle:"Generate or edit an image when the requested result is visual."
  }),
  web_search:Object.freeze({
    id:"web_search",
    layer:"information",
    provider:"openai_responses",
    authority:"read_only",
    background:false,
    persistent_outputs:false,
    principle:"Retrieve current public information."
  }),
  project_work:Object.freeze({
    id:"project_work",
    layer:"minds",
    provider:"native_minds",
    authority:"read_scoped",
    background:false,
    persistent_outputs:false,
    principle:"Read project Desktop, Planner, Knowledge and Threads with provenance."
  }),
  durable_mission:Object.freeze({
    id:"durable_mission",
    layer:"runtime",
    provider:"native_minds",
    authority:"mission_scoped",
    background:true,
    persistent_outputs:true,
    principle:"Continue bounded multi-checkpoint work after the initiating conversation ends."
  })
});

export function capabilityPromptSummary(){
  return Object.values(CAPABILITY_REGISTRY).map((x:any)=>({
    id:x.id,layer:x.layer,authority:x.authority,background:x.background,
    persistent_outputs:x.persistent_outputs,output_kinds:x.output_kinds||[]
  }));
}
