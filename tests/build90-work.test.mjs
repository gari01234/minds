import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Build 90.3 makes Panorama the first Work lens while preserving established Work tools',()=>{
 const shell=read('apps/isabella/shell.js'),work=read('apps/isabella/work.js');
 assert.ok(shell.includes('data-work-view="overview" class="active"'));
 for(const name of ['desktop','planner','knowledge','threads'])assert.ok(shell.includes('data-work-view="'+name+'"'));
 assert.ok(work.includes("localStorage.getItem('minds-work-view')||'overview'"));
 assert.ok(work.includes("if(view==='overview')await renderOverview()"));
});
test('Build 90.3 Project understanding reads the canonical project data and never creates buckets or accepted facts',()=>{
 const work=read('apps/isabella/work.js');
 const start=work.indexOf('async function renderOverview()');
 const end=work.indexOf('const knowledgeStates=',start);
 assert.ok(start>=0&&end>start);
 const body=work.slice(start,end);
 assert.ok(body.includes("sb.from('isabella_tasks').select("));
 assert.ok(body.includes("sb.from('minds_work_claims').select("));
 assert.ok(body.includes("sb.from('minds_work_files').select("));
 assert.ok(body.includes("sb.rpc('minds_project_model_snapshot'"));
 assert.ok(body.includes('projectModelPanel()'));
 assert.ok(body.includes("project?.id!==projectId"));
 assert.ok(body.includes('No pude consultar las tareas de este proyecto.'));
 assert.ok(body.includes('no demuestra cobertura completa'));
 assert.ok(!body.includes('await loadPlanner()'),'Overview must not create default buckets as a side effect');
 assert.ok(!body.includes('.insert('));
 assert.ok(!body.includes('.update('));
 assert.ok(!body.includes('.delete('));
});
test('Build 90.3 provides buttons to the canonical Work screens rather than shadow copies',()=>{
 const work=read('apps/isabella/work.js'),css=read('apps/isabella/app.css');
 assert.ok(work.includes('data-work-go="planner"'));
 assert.ok(work.includes('data-work-go="knowledge"'));
 assert.ok(work.includes('data-work-go="desktop"'));
 assert.ok(work.includes('data-work-go="threads"'));
 assert.ok(work.includes('work-overview-host'));
 assert.ok(css.includes('.work-body.work-overview-host'));
});
