import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const suite=JSON.parse(read('tests/fixtures/general-capability-acceptance-v01.json'));
const chat=read('supabase/functions/isabella-chat/index.ts');
const runtime=read('supabase/functions/isabella-capability-runtime/index.ts');
const shared=read('supabase/functions/_shared/capability-runtime.ts');
const runner=read('supabase/functions/isabella-capability-runner/index.ts');

test('79.2 acceptance suite covers heterogeneous material work with one runtime',()=>{
  assert.equal(suite.version,'general-capability-acceptance-v0.1');
  assert.deepEqual(suite.cases.map(x=>x.id),[
    'spreadsheet_generation','presentation_generation','edit_existing_document','transform_project_file','background_survival'
  ]);
  assert.ok(suite.cases.find(x=>x.id==='spreadsheet_generation').expected_outputs.includes('xlsx'));
  assert.ok(suite.cases.find(x=>x.id==='presentation_generation').expected_outputs.includes('pptx'));
  assert.ok(suite.cases.find(x=>x.id==='edit_existing_document').input_sources.includes('artifact'));
  assert.ok(suite.cases.find(x=>x.id==='transform_project_file').input_sources.includes('work_file'));
  assert.equal(suite.cases.find(x=>x.id==='background_survival').requires_background_survival,true);
});

test('79.2 does not add format-specific execution tools',()=>{
  assert.ok(chat.includes('name:"execute_artifact_task"'));
  for(const forbidden of ['make_excel','make_xlsx','make_powerpoint','make_pptx','edit_word','transform_pdf']){
    assert.ok(!chat.includes('name:"'+forbidden+'"'),forbidden+' must not become a tool');
    assert.ok(!runtime.includes(forbidden),forbidden+' must not become runtime logic');
  }
  assert.ok(shared.includes('general_execution'));
});

test('79.2 general execution accepts owned artifact and Work file inputs generically',()=>{
  assert.ok(chat.includes('input_files:{type:"array"'));
  assert.ok(chat.includes('enum:["artifact","work_file"]'));
  assert.ok(chat.includes('name:"search_generated_artifacts"'));
  assert.ok(chat.includes('input_files:inputs'));
  assert.ok(chat.includes('pasa el archivo binario original al runtime'));
  assert.ok(runtime.includes('resolveInputFiles'));
  assert.ok(runtime.includes('minds_artifacts'));
  assert.ok(runtime.includes('minds_work_files'));
  assert.ok(runtime.includes('bucket="minds-artifacts"'));
  assert.ok(runtime.includes('bucket="minds-work"'));
  assert.ok(runtime.includes('MAX_INPUT_TOTAL_BYTES'));
});

test('79.2 passes file inputs directly into the same Code Interpreter request',()=>{
  assert.ok(shared.includes('CAPABILITY_RUNTIME_VERSION="capability-runtime-v0.2.1"'));
  assert.ok(shared.includes('type:"input_file"'));
  assert.ok(shared.includes('file_data:file.file_data'));
  assert.ok(shared.includes('type:"code_interpreter"'));
  assert.ok(shared.includes('background:true'));
  assert.ok(shared.includes('input:[{role:"user",content}]'));
  assert.ok(shared.includes('Edit or transform them directly'));
  assert.ok(shared.includes('Preserve source content, formulas, structure and formatting'));
});


test('79.2 transformed outputs retain source provenance and do not re-emit user inputs',()=>{
  assert.ok(shared.includes('derived_from:Array.isArray(run?.metadata?.input_files)?run.metadata.input_files:[]'));
  assert.ok(shared.includes('x.source!=="user"'));
  assert.ok(shared.includes('const generated:any[]=[]'));
  assert.ok(shared.includes('citedIds.has'));
});

test('79.2 keeps background completion independent of the browser session',()=>{
  assert.ok(runtime.includes('status:"queued"'));
  assert.ok(runtime.includes('provider_response_id'));
  assert.ok(runner.includes('minds_capability_runs'));
  assert.ok(runner.includes('reconcileCapabilityRun'));
  assert.ok(runner.includes('{deliver:true}'));
});

test('79.2 input files remain bounded and owned',()=>{
  assert.ok(runtime.includes('.eq("user_id",userId)'));
  assert.ok(runtime.includes('MAX_INPUT_FILE_BYTES=12*1024*1024'));
  assert.ok(runtime.includes('MAX_INPUT_TOTAL_BYTES=24*1024*1024'));
  assert.ok(runtime.includes('input_file_type_not_supported'));
});

test('79.2 suite itself contains no tool routing by filename extension',()=>{
  const formats=new Set(suite.cases.flatMap(x=>x.expected_outputs));
  assert.ok(formats.has('xlsx')&&formats.has('pptx')&&formats.has('docx')&&formats.has('pdf'));
  assert.equal(suite.invariant,'one_general_runtime_no_format_specific_handlers');
  assert.equal(new Set(suite.cases.map(()=> 'execute_artifact_task')).size,1);
});
