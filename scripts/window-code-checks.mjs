// Trusted test entrypoint, copied into the image before any generated edits.
import {spawnSync} from 'node:child_process';
const entries=["supabase/functions/_shared/mission-runtime.ts", "supabase/functions/_shared/mission-runtime-routing.ts", "supabase/functions/_shared/openai-agents-runtime.ts", "supabase/functions/_shared/capability-registry.ts", "supabase/functions/_shared/skill-registry.ts", "supabase/functions/_shared/persistent-work.ts", "supabase/functions/_shared/capability-runtime.ts", "supabase/functions/_shared/temporal-presentation.ts", "supabase/functions/_shared/constitutional-state.ts", "supabase/functions/isabella-agent-shadow/index.ts", "supabase/functions/isabella-chat/index.ts", "supabase/functions/isabella-self-review/index.ts", "supabase/functions/isabella-code-preparation/index.ts", "supabase/functions/isabella-capability-runtime/index.ts", "supabase/functions/isabella-capability-runner/index.ts", "supabase/functions/isabella-heartbeat/index.ts", "supabase/functions/isabella-mission-runner/index.ts", "supabase/functions/isabella-routine-runner/index.ts", "supabase/functions/isabella-push/index.ts", "supabase/functions/isabella-delivery-runner/index.ts", "supabase/functions/isabella-artifact-intake/index.ts", "supabase/functions/isabella-runtime-mcp/index.ts", "supabase/functions/isabella-operating-model/index.ts", "supabase/functions/isabella-work-ingest-runner/index.ts"];
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});if(r.error)console.error(r.error.message);if(r.status!==0)process.exit(r.status??1);}
if(process.argv.includes('--cache')){
 run('deno',['cache','--no-lock','--node-modules-dir=none',...entries]);
}else{
 // Type-check before executing candidate code. Dependencies were cached from trusted main.
 run('deno',['check','--cached-only','--no-lock','--node-modules-dir=none',...entries]);
 if(!process.argv.includes('--types-only')){
  run('sh',['-c','node --test --test-reporter=tap tests/*.test.mjs']);
  run('node',['scripts/build.mjs']);
 }
}
