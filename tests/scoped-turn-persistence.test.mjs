import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const sync=readFileSync(new URL("../apps/isabella/sync.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../apps/isabella/app.js",import.meta.url),"utf8");
const s=sync.slice(sync.indexOf("function scopedTurnReady("),sync.indexOf("async function pushConversation("));
const ready=new Function(s+"\nreturn scopedTurnReady;")();

test("new unscope-resolved turns stay local, never become automatic legacy memory",()=>{
 const msg={role:"user",text:"Corrige la tarea",metadata:{durable_request_id:"req"}};
 assert.equal(ready(msg),false);
 assert.equal(ready({role:"assistant",text:"Listo",metadata:{}}),false);
 assert.equal(ready({role:"user",text:"Old chat",metadata:{exposure_scope:{
   version:0,kind:"global",key:"legacy"}}}),false);
 assert.match(sync,/const approved=\(messages\|\|\[\]\)\.filter\(scopedTurnReady\)/);
 assert.match(sync,/if\(!approved\.length\)return/);
 assert.doesNotMatch(sync,/exposure_scope_key:scope\?\.key\|\|'legacy'/);
});
test("only verified scope-shaped turns are persisted, preserving project isolation",()=>{
 const global={role:"user",text:"Una tarea",metadata:{exposure_scope:{
   version:1,kind:"global",ref:null,key:"global"}}};
 assert.equal(ready(global),true);
 assert.equal(ready({...global,metadata:{exposure_scope:{...global.metadata.exposure_scope,key:"project:other"}}}),false);
 const project={role:"assistant",text:"He preparado la propuesta",metadata:{exposure_scope:{
   version:1,kind:"project",ref:"project-uuid",key:"project:project-uuid"}}};
 assert.equal(ready(project),true);
 assert.equal(ready({...project,metadata:{exposure_scope:{...project.metadata.exposure_scope,ref:null}}}),false);
 assert.equal(ready({...project,role:"system"}),false);
 assert.equal(ready({...project,text:""}),false);
});
test("user scope is recorded after the server response before client sync",()=>{
 assert.match(app,/const userTurn=say\('user'/);
 assert.match(app,/userTurn\.metadata=\{\.\.\.\(userTurn\.metadata\|\|\{\}\),exposure_scope:exposure\}/);
 assert.match(app,/if\(result\?\.reply\|\|result\?\.artifacts\?\.length\)say\('assistant'/);
 assert.match(sync,/exposure_scope_version:1/);
 assert.match(sync,/exposure_scope_kind:scope\.kind/);
 assert.match(sync,/exposure_scope_key:scope\.key/);
 assert.doesNotThrow(()=>new Script(sync,{filename:"sync.js"}));
});
