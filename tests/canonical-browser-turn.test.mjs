import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  browserTurnId,canonicalBrowserOwnerRow,sameBrowserOwnerTurn
} from "../supabase/functions/_shared/browser-turn-ledger.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const server=read("supabase/functions/isabella-chat/index.ts");
const app=read("apps/isabella/app.js");
const client=read("apps/isabella/ai.js");
const user="11111111-2222-4333-8444-555555555555";
const conversation="aaaaaaaa-2222-4333-8444-555555555555";
const requestId="12345678-1234-4234-8234-123456789abc";
const scope={version:1,kind:"project",ref:"bbbbbbbb-2222-4333-8444-555555555555",
  key:"project:bbbbbbbb-2222-4333-8444-555555555555"};
const row=()=>canonicalBrowserOwnerRow({userId:user,conversationId:conversation,
  requestId,message:"agrega dos tareas para hoy",scope});

test("one stable UUID represents a browser user turn across client, context and DB",()=>{
  assert.equal(browserTurnId(requestId),requestId);
  assert.equal(browserTurnId("client-generated-non-uuid"),null);
  const x=row();
  assert.equal(x.client_key,requestId);
  assert.equal(x.user_id,user);
  assert.equal(x.conversation_id,conversation);
  assert.equal(x.role,"user");
  assert.equal(x.exposure_scope_version,1);
  assert.equal(x.provenance_class,"owner");
  assert.equal(x.metadata.turn_delivery,"received");
  assert.equal(x.exposure_scope_key,scope.key);
  assert.equal(x.provisional,false);
  assert.equal(sameBrowserOwnerTurn(x,row()),true);
});
test("idempotent replay rejects any change of utterance, role or server scope",()=>{
  const x=row();
  assert.equal(sameBrowserOwnerTurn({...x,content:"otra tarea"},x),false);
  assert.equal(sameBrowserOwnerTurn({...x,role:"assistant"},x),false);
  assert.equal(sameBrowserOwnerTurn({...x,exposure_scope_key:"global"},x),false);
  assert.equal(sameBrowserOwnerTurn({...x,exposure_scope_version:0},x),false);
  assert.equal(sameBrowserOwnerTurn({...x,exposure_scope_ref:null},x),false);
});
test("unverified or mismatched global/project/work-thread scopes are rejected",()=>{
  const base={userId:user,conversationId:conversation,requestId,
    message:"hoy dos tareas",scope};
  for(const bad of [
    {...scope,key:"global"}, {...scope,ref:null},
    {version:0,kind:"global",key:"global"},
    {version:1,kind:"global",key:"project:id"},
    {version:1,kind:"custom",key:"custom:id",ref:"id"}
  ])assert.throws(()=>canonicalBrowserOwnerRow({...base,scope:bad}),/invalid_browser_turn_scope/);
  const global=canonicalBrowserOwnerRow({...base,
    scope:{version:1,kind:"global",key:"global",ref:null}});
  assert.equal(global.exposure_scope_key,"global");
  assert.equal(global.exposure_scope_ref,null);
});
test("browser stores server-scoped owner turn BEFORE model recall or provider-history selection",()=>{
  const persist=server.indexOf("await persistCanonicalBrowserOwnerTurn(req,clientMessageId,effectiveMessage,exposureScope)");
  const recall=server.indexOf("const [recentDb, recalled");
  const provider=server.indexOf("getOrCreateOpenAIConversation(req,apiKey,seed");
  assert.ok(persist>0&&recall>persist&&provider>recall);
  assert.match(server,/if\(existing\.data\)\{\s*if\(!sameBrowserOwnerTurn/);
  assert.match(server,/if\(insert\.error\.code!=="23505"\)throw insert\.error/);
  assert.match(server,/eq\("user_id",user\.id\)\.eq\("app_scope","isabella"\)/);
  assert.match(server,/browser_turn_persistence_failed/);
});
test("client uses one stable ID and never promotes an unknown scope to global",()=>{
  assert.match(app,/id:meta\.id\|\|uid\(\)/);
  assert.match(app,/id:durableRequestId\|\|undefined,attachments:copy,replyTo/);
  assert.match(client,/fastRequestId:options\.durableRequestId\|\|options\.fastRequestId/);
  assert.match(app,/const exposure=result\?\.exposure_scope\?\.version===1/);
  assert.doesNotMatch(app,/basis:'client_fallback'/);
  assert.match(read("apps/isabella/sync.js"),/const approved=\(messages\|\|\[\]\)\.filter\(scopedTurnReady\)/);
});
