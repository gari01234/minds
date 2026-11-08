import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  resolveAssistantProfile, profileFirstName, personaText,
  profileInstructions, profileTools, profileOwnerForUser, OFFICE_LANGUAGE_RULE
} from "../supabase/functions/_shared/assistant-profile.mjs";
import { isabellaCoreInstructions } from "../supabase/functions/_shared/isabella-core.mjs";
import { relationshipPolicy } from "../supabase/functions/_shared/relationship-policy.ts";
import { promptComponentSizes } from "../supabase/functions/_shared/light-conversation-context.mjs";
import { SYSTEM_NOTICE_PATTERNS } from "../supabase/functions/_shared/system-notice.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Window profile is a strict identity, including nested tool contracts", () => {
  const p = resolveAssistantProfile();
  assert.equal(p.id, "window");
  assert.equal(p.multi_user, false);
  assert.equal(p.timezone, "Europe/Berlin");
  const input = isabellaCoreInstructions({
    relationship: "Contrato de prueba",
    tools: [{type: "function", name: "search_work", description: "Search Gari's Work"}]
  });
  assert.strictEqual(profileInstructions(input, p), input);
  assert.strictEqual(personaText(input, {profile: p}), input);
  const tools = [{type: "function", name: "consult_sofia", description: "For Gari"}];
  assert.strictEqual(profileTools(tools, p), tools);
  assert.strictEqual(profileTools(tools, p)[0], tools[0]);
});

test("Office owner is taken from authenticated member display name, not client input", () => {
  const p = resolveAssistantProfile("office");
  assert.equal(p.owner_source, "office_members.display_name");
  assert.equal(profileFirstName("  Alex Beispiel  "), "Alex");
  assert.equal(profileFirstName(""), null);
  assert.throws(() => personaText("Gari", {profile: p}), /office_owner_name_required/);
  const context = isabellaCoreInstructions({relationship: "Isabella habla con Gari."});
  const result = profileInstructions(context, p, "Alex Beispiel");
  assert.match(result, /Eres Romy/);
  assert.match(result, /Alex/);
  assert.doesNotMatch(result, /\bGari\b|\bIsabella\b/);
  assert.ok(result.endsWith(OFFICE_LANGUAGE_RULE));
});

test("Office strips excluded tools and localizes only descriptions, not schema keys", () => {
  const original = [
    {type:"web_search"},
    {type:"function",name:"consult_sofia",description:"Sofía para Gari"},
    {type:"function",name:"update_feed_preferences",description:"Update feed"},
    {type:"function",name:"create_task",description:"Create for Gari",parameters:{
      type:"object",properties:{user_excerpt:{type:"string",description:"Gari's exact words"}}
    }}
  ];
  const out = profileTools(original, "office", "Alex Beispiel");
  assert.deepEqual(out.map(t=>t.name||t.type), ["web_search","create_task"]);
  assert.equal(out[1].description, "Create for Alex");
  assert.equal(out[1].parameters.properties.user_excerpt.description, "Alex's exact words");
  assert.equal(original[3].description, "Create for Gari");
  assert.equal(original[3].parameters.properties.user_excerpt.description, "Gari's exact words");
  assert.equal(out[1].parameters.properties.user_excerpt.type, "string");
  assert.throws(() => resolveAssistantProfile("other"), /unsupported_assistant_profile/);
});

test("German fixed app notices are identical server/browser patterns", () => {
  const root = {};
  vm.runInNewContext(read("apps/isabella/turn-integrity.js"), {window:root, globalThis:root});
  assert.deepEqual(Array.from(root.MINDS_TURN_INTEGRITY.SYSTEM_NOTICE_PATTERNS, String),
    SYSTEM_NOTICE_PATTERNS.map(String));
  for(const value of ["Hinweis der App: wiederholen", "Bestätigt: Aufgabe",
    "Verworfen: Aufgabe", "Keine Antwort möglich: Zeitüberschreitung"]) {
    assert.ok(SYSTEM_NOTICE_PATTERNS.some(pattern => pattern.test(value)), value);
  }
});

test("Shared chat dictionary chooses Spanish by default, German only for Office", () => {
  for(const [profile,locale,undo,assistant] of [
    [undefined,"es","Deshacer","Isabella"],["window","es","Deshacer","Isabella"],
    ["office","de","Rückgängig","Romy"]
  ]) {
    const root = {APP_PROFILE:profile};
    vm.runInNewContext(read("apps/isabella/assistant-i18n.js"), {window:root, globalThis:root});
    assert.equal(root.ASSISTANT_I18N.locale,locale);
    assert.equal(root.ASSISTANT_I18N.t("undo"),undo);
    assert.ok(root.ASSISTANT_I18N.t("presence_enabled").includes(assistant));
  }
});

test("Prompt-component budget: Office transformation is measured without live services", () => {
  const tools = [{type:"function",name:"create_task",description:"Create task for Gari"},
    {type:"function",name:"consult_sofia",description:"Read Sofía for Gari"}];
  const instructions = isabellaCoreInstructions({relationship:"Contrato de prueba",tools});
  const context = {current_date:"2026-11-08",today_tasks:[]};
  const input = [{role:"user",content:"Hallo, Romy"}];
  const before = promptComponentSizes({instructions,context,input,tools});
  const officeTools = profileTools(tools,"office","Alex Beispiel");
  const after = promptComponentSizes({
    instructions:profileInstructions(instructions,"office","Alex Beispiel"),
    context,input,tools:officeTools
  });
  assert.equal(before.input_chars,after.input_chars);
  assert.equal(before.context_chars,after.context_chars);
  assert.ok(after.tools_chars < before.tools_chars);
  console.log("romy_phase0_prompt_component_sizes",JSON.stringify({before,after}));
});

test("Chat does not resolve Office identity in Window and never accepts a client-supplied owner name", () => {
  const source = read("supabase/functions/isabella-chat/index.ts");
  assert.match(source,/assistantProfile.multi_user/);
  assert.match(source,/office_members/);
  assert.match(source,/\.eq\("user_id",authenticated\.id\)/);
  assert.match(source,/profileInstructions\(modelInstructions,assistantProfile\.id,assistantOwner\)/);
  assert.doesNotMatch(source,/body\?\.owner_name|body\?\.assistant_profile/);
  assert.match(source,/instructions:transientInstructions\(providerInstructions,/);
  assert.match(source,/tools\.splice\(0,tools\.length,\.\.\.profileTools\(tools,assistantProfile\.id,assistantOwner\)\)/);
  assert.ok(relationshipPolicy("conversation").length>0);
});

test("Office review notices are German while the Window summaries remain identical", () => {
  const p={kind:"task",action:"create",title:"Prüfaufgabe",date:"2026-11-09",request_id:"r"};
  const rootOffice={APP_PROFILE:"office"};
  vm.runInNewContext(read("apps/isabella/turn-integrity.js"),{window:rootOffice,globalThis:rootOffice,Date,Intl});
  const review=rootOffice.MINDS_TURN_INTEGRITY.summary({ok:true,outcome:"proposal_created",proposals:[p]});
  assert.match(review,/^Vorschlag: Aufgabe/);
  assert.match(review,/Bestätigung ausstehend/);
  assert.equal(rootOffice.MINDS_TURN_INTEGRITY.summary({ok:true,outcome:"action_applied",applied_count:1}),"Gespeichert.");
  const rootWindow={APP_PROFILE:"window"};
  vm.runInNewContext(read("apps/isabella/turn-integrity.js"),{window:rootWindow,globalThis:rootWindow,Date,Intl});
  assert.match(rootWindow.MINDS_TURN_INTEGRITY.summary({ok:true,outcome:"proposal_created",proposals:[p]}),/^Propuesta: añadir/);
  assert.equal(rootWindow.MINDS_TURN_INTEGRITY.summary({ok:true,outcome:"action_applied",applied_count:1}),"Guardado.");
  assert.match(read("apps/isabella/index.html"),/assistant-i18n\.js\?v=1/);
});


test("Office member identity is owner-scoped, active-only and independent per person", async () => {
  const entries = new Map([
    ["11111111-1111-4111-8111-111111111111", {display_name:"Alex Beispiel",is_active:true}],
    ["22222222-2222-4222-8222-222222222222", {display_name:"Mara Muster",is_active:true}],
    ["33333333-3333-4333-8333-333333333333", {display_name:"Inaktiv Muster",is_active:false}]
  ]);
  const sb = {from(table) {
    assert.equal(table,"office_members");
    return {select(columns) {
      assert.equal(columns,"display_name,is_active");
      return {eq(key,id) {
        assert.equal(key,"user_id");
        return {maybeSingle:async()=>({data:entries.get(id)||null,error:null})};
      }};
    }};
  }};
  const p=resolveAssistantProfile("office");
  assert.equal(await profileOwnerForUser(sb,"11111111-1111-4111-8111-111111111111",p),"Alex");
  assert.equal(await profileOwnerForUser(sb,"22222222-2222-4222-8222-222222222222",p),"Mara");
  assert.equal(await profileOwnerForUser(sb,"33333333-3333-4333-8333-333333333333",p),null);
  assert.equal(await profileOwnerForUser(sb,"44444444-4444-4444-8444-444444444444",p),null);
  assert.equal(await profileOwnerForUser(null,"11111111-1111-4111-8111-111111111111",p),null);
});

test("Dreaming uses an identical Window prompt but a member-specific Office prompt", async () => {
  const {dreamCaller,DREAM_INSTRUCTIONS}=await import("../supabase/functions/_shared/isabella-dream.mjs");
  const recorded=[];
  const fakeFetch=async(_url,opts)=>{
    recorded.push(JSON.parse(opts.body));
    return {ok:true,json:async()=>({status:"completed",output:[{content:[{type:"output_text",text:"{}"}]}]})};
  };
  const caller=dreamCaller("placeholder-test-only","mock",fakeFetch);
  await caller({transcripcion_nueva:[]});
  await caller({transcripcion_nueva:[]},{profile:"office",owner:"Alex Beispiel"});
  assert.equal(recorded[0].instructions,DREAM_INSTRUCTIONS);
  assert.match(recorded[1].instructions,/Romy/);
  assert.match(recorded[1].instructions,/Alex/);
  assert.ok(recorded[1].instructions.endsWith(OFFICE_LANGUAGE_RULE));
  assert.doesNotMatch(recorded[1].instructions,/\\bGari\\b|\\bIsabella\\b/);
});
