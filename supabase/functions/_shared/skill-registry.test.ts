import {assertEquals,assertThrows} from "jsr:@std/assert@1";
import {
  MAX_COMPOSED_SKILLS,
  composeSkillTrace,
  normalizeSkillRecord,
  normalizeSkillTrace,
  skillLoadEnvelope
} from "./skill-registry.ts";

const policy=(id:string)=>id==="read"?"allow":id==="write"?"confirm":"deny" as const;

Deno.test("skill tool preferences never grant authority",()=>{
  const skill=normalizeSkillRecord({
    slug:"Preparar Reunión",
    name:"Preparar reunión",
    description:"Procedimiento",
    instructions:"Haz el briefing.",
    preferred_tools:["read","write","unknown"]
  },"system",policy);
  assertEquals(skill.slug,"preparar-reunion");
  assertEquals(skill.tool_hints,[{id:"read",policy:"allow"},{id:"write",policy:"confirm"}]);
  assertEquals(skill.unavailable_tools,["unknown"]);
  assertEquals(skill.authority,"inherits_runtime_policy");
  assertEquals(skill.grants,[]);
  const envelope=skillLoadEnvelope(skill,[skill]);
  assertEquals(envelope.grants,[]);
});

Deno.test("skill composition is deduplicated and bounded",()=>{
  const base=normalizeSkillRecord({slug:"a",name:"A",description:"A",instructions:"A"},"system",()=> "allow");
  const b=normalizeSkillRecord({slug:"b",name:"B",description:"B",instructions:"B"},"personal",()=> "allow");
  let trace=composeSkillTrace([],base);
  trace=composeSkillTrace(trace,base);
  trace=composeSkillTrace(trace,b);
  assertEquals(trace.length,2);
  for(const id of ["c","d"])trace=composeSkillTrace(trace,normalizeSkillRecord({slug:id,name:id.toUpperCase(),description:id,instructions:id},"system",()=> "allow"));
  assertEquals(trace.length,MAX_COMPOSED_SKILLS);
  assertThrows(()=>composeSkillTrace(trace,normalizeSkillRecord({slug:"e",name:"E",description:"E",instructions:"E"},"system",()=> "allow")));
});

Deno.test("skill trace strips instructions and tool lists",()=>{
  const trace=normalizeSkillTrace([{slug:"x",name:"X",version:2,source:"personal",instructions:"secret",preferred_tools:["write"]}]);
  assertEquals(trace,[{slug:"x",name:"X",version:2,source:"personal"}]);
});
