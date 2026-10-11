import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../supabase/functions/isabella-chat/index.ts',import.meta.url),'utf8');
test('Isabella discovers Work project from an explicitly named canonical Desktop file',()=>{
  assert.match(code,/function canonicalWorkFilename\(value:string\)/);
  assert.match(code,/async function projectFromExplicitWorkFile\(req:Request,message:string\)/);
  assert.match(code,/sb\.from\("minds_work_files"\)/);
  assert.match(code,/select\("name,project_id,isabella_projects\(name\)"\)/);
  assert.match(code,/query\.includes\(stem\)/);
  assert.match(code,/projects\.size===1/);
});
test('Project inference runs only for explicit Work-source references before exposure scoping',()=>{
  const route=code.indexOf('const route=await routeRequest(req,effectiveMessage');
  const infer=code.indexOf('projectFromExplicitWorkFile(req,effectiveMessage)',route);
  const scope=code.indexOf('const exposureScope=await exposureScopeForTurn(req,route',route);
  assert.ok(route>=0&&infer>route&&scope>infer);
  assert.match(code,/if\(!background&&!currentWorkThread&&!route\.project\)/);
  assert.match(code,/route\.source=String\(route\.source\|\|"deterministic"\)\+"\+canonical_work_file"/);
});
test('No ambiguous filename silently selects a project or modifies Work records',()=>{
  const a=code.indexOf('async function projectFromExplicitWorkFile');
  const b=code.indexOf('async function routeRequest',a);
  const f=code.slice(a,b);
  assert.match(f,/return projects\.size===1\?\[\.\.\.projects\]\[0\]:null/);
  assert.doesNotMatch(f,/\.insert\(|\.update\(|\.delete\(/);
});
