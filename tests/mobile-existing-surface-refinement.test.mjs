import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const work=read('apps/isabella/work.js');
const css=read('apps/isabella/mobile-refinement.css');
const html=read('apps/isabella/index.html');
const sw=read('apps/isabella/sw.js');
const theory=read('apps/theory/design-system.css');
const shell=read('apps/isabella/shell.js');
test('UX A.5 translates Work technical statuses only in the visible Panorama label',()=>{
  assert.match(work,/WORK_STATUS_LABELS=Object\.freeze/);
  for(const name of ["not_started:'Sin empezar'","in_progress:'En curso'","waiting:'En espera'","completed:'Completada'"])
    assert.ok(work.includes(name),'Missing '+name);
  assert.match(work,/workStatusText\(x\.work_status\)/);
  assert.match(work,/Estado sin clasificar/);
  assert.match(work,/work_status:done\?'completed':'not_started'/);
  assert.ok(work.includes("sb.from('isabella_tasks').select("));
});
test('UX A.5 mobile Planner layout toggles without changing its canonical actions',()=>{
  assert.match(work,/WORK_MOBILE_LAYOUT_KEY/);
  assert.match(work,/localStorage\.getItem\(WORK_MOBILE_LAYOUT_KEY\)!=='columns'/);
  assert.match(work,/data-work-layout-toggle aria-pressed="\$\{mobileList\}"/);
  assert.match(work,/board\.classList\.toggle\('mobile-stack',listMode\)/);
  assert.match(work,/listMode\?'list':'columns'/);
  for(const key of ['data-work-add-bucket','data-work-add-task','data-work-edit-bucket',
    'data-work-task-list','data-work-toggle','card.ondragstart','bucket.ondrop','persistWorkTaskOrder'])
    assert.ok(work.includes(key),'Regression to '+key);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.work-board\.mobile-stack/);
  assert.match(css,/\.work-mobile-layout\{display:none\}/);
  assert.doesNotMatch(css,/\.orb|\.main-nav/);
});
test('UX A.5 is last stylesheet and SW keeps versioned assets offline',()=>{
  assert.ok(html.includes('./mobile-refinement.css?v=1'));
  assert.ok(sw.includes('./mobile-refinement.css?v=1'));
  assert.ok(html.includes('./work.js?v=30'));
  assert.ok(sw.includes('./work.js?v=30'));
  assert.ok(sw.includes('isabella-shell-v168'));
  assert.ok(html.indexOf('./mobile-refinement.css?v=1')>html.indexOf('./dashboard-workload.css?v=1'));
  for(const route of ['assistant','feed','calendar','work','readings','thoughts'])
    assert.ok(shell.includes('data-nav="'+route+'"'),'Missing destination '+route);
});
test('UX A.5 reading filter improvement retains navigation and editorial language',()=>{
  assert.match(theory,/\.v09-reading-filters\{[\s\S]*?overflow-x:auto/);
  assert.match(theory,/scroll-snap-type:x proximity/);
  assert.match(theory,/scroll-snap-align:start/);
  assert.match(theory,/\.v09-reading-filters button\.active/);
  for(const s of [css,theory]){
    let d=0;
    for(const c of s.replace(/\/\*[\s\S]*?\*\//g,'')){
      if(c==='{')d++;if(c==='}')d--;assert.ok(d>=0);
    }
    assert.equal(d,0);
  }
});
