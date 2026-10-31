import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../apps/isabella/work-apple.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../apps/isabella/index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../apps/isabella/sw.js',import.meta.url),'utf8');

test('Work uses updated visual system without changing other MINDS screens',()=>{
 assert.match(html,/work-apple\.css\?v=1/);
 assert.match(sw,/work-apple\.css\?v=1/);
 assert.match(styles,/body\[data-section="work"\]/);
 assert.match(styles,/\.modal:has\(\.work-bucket-editor\)/);
 assert.match(styles,/--work-accent:#007aff/);
 assert.match(styles,/-apple-system/);
 assert.match(styles,/prefers-reduced-motion/);
 assert.match(styles,/prefers-contrast:more/);
 assert.doesNotThrow(()=>new Function(source));
});
test('real cards use clear due dates, inline calendar icon, and visible assignee',()=>{
 const from=source.indexOf('const WORK_ICON='),end=source.indexOf('async function hydratePlannerImages',from);
 assert.ok(from>0&&end>from);
 const code=source.slice(from,end);
 const runner=vm.runInNewContext('(()=>{'+code+';return taskCard})()',{
  taskChecklist:t=>t.checklist||[],
  taskAttachments:t=>t.attachments||[],
  cachedWorkUrl:()=>'',localIso:()=> '2026-10-31',
  team:[{id:'person-1',name:'Yvonne Beispiel'}],
  esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')
 });
 const output=runner({
  id:'task-1',title:'Rathausplatz – Text ergänzen',due_date:'2026-11-02',
  assignee_person_ids:['person-1'],checklist:[{text:'Prüfen',done:false}],
  attachments:[{path:'image.jpg',mime:'image/jpeg'}],completed_at:null
 });
 assert.match(output,/work-card-assignee/);
 assert.match(output,/Yvonne Beispiel/);
 assert.match(output,/work-assignee-avatar/);
 assert.match(output,/work-due/);
 assert.match(output,/<svg[^>]*work-ui-icon/);
 assert.match(output,/<time datetime="2026-11-02">/);
 assert.match(output,/data-work-task-image="image.jpg"/);
 assert.doesNotMatch(output,/▣|⌕|☑/);
});
test('Bucket removal remains concise without losing data guarantees',()=>{
 assert.match(source,/Später wiederherstellbar/);
 assert.match(source,/Keine offenen Aufgaben müssen verschoben werden/);
 assert.match(source,/erledigte Aufgabe/);
 assert.match(source,/minds_work_bucket_archive/);
 assert.match(source,/openArchivedBuckets/);
});
test('task icons have no external downloads or untrusted inline HTML',()=>{
 assert.match(source,/const WORK_ICON=/);
 assert.match(source,/viewBox="0 0 24 24"/);
 assert.doesNotMatch(source,/lucide\.js|fontawesome|cdn\.jsdelivr.*work/);
 assert.match(source,/aria-label="Verantwortlich:/);
});
