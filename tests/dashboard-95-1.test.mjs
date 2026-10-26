import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL('../apps/isabella/'+name,import.meta.url),'utf8');
const desk=read('dashboard.js'),core=read('app.js'),styles=read('dashboard-fixes.css');
const sync=read('sync.js'),html=read('index.html'),sw=read('sw.js');
test('views rail is collapsed on each new launch and remains globally toggleable',()=>{
 assert.match(desk,/navCollapsed:true/);
 assert.match(desk,/sidebar.prepend\(navButton\)/);
 assert.match(desk,/prefs.navCollapsed=!prefs.navCollapsed;layout\(\)/);
 assert.match(styles,/body\.desk-enabled\.minds-nav-collapsed \.app/);
 assert.match(styles,/body\.desk-enabled #desktopLenses/);
 assert.doesNotMatch(styles,/body\[data-section="assistant"\]\.desk-enabled #desktopLenses/);
});
test('desktop chat compositor is untransformed, flex-shrinkable, and scrolls to latest after mounting',()=>{
 assert.match(styles,/transform:none!important/);
 assert.match(styles,/\.composer textarea \{/);
 assert.match(styles,/min-width:0!important;width:0!important/);
 assert.match(desk,/scrollChatToLatest/);
 assert.match(core,/scrollChatToLatest:\(\)=>scrollAssistantToLatest\(true\)/);
});
test('enlarged calendar ports the REAL Tiempo toolbar, controls and calendar content',()=>{
 assert.match(desk,/\['\.cal-toolbar','\.cal-nav','#calendarContent'\]/);
 assert.match(desk,/nativeTimeHost\.append\(node\)/);
 assert.match(desk,/nativeTimeScreen\.append\(node\)/);
 assert.match(desk,/app\(\)\?\.renderNativeCalendar\?\.\(\)/);
 assert.match(core,/isabella:before-screen-change/);
 assert.match(desk,/if \(event\.detail\?\.next!=='assistant'\) releaseTime\(\)/);
 assert.match(desk,/getState\(\)\?\.screen==='assistant'/);
 assert.match(core,/renderNativeCalendar:\(\)=>renderCalendar\(\)/);
 assert.match(core,/function initTaskDrag\(\)/);
 assert.match(core,/function initEventDrag\(\)/);
 assert.match(core,/\['day','week','month'\]/);
});
test('Sunsama-inspired sessions are explicit events linking the original task, not duplicate tasks',()=>{
 assert.match(core,/function planTaskSession\(taskId,scheduledDate=null,proposedStart='09:00'\)/);
 assert.match(core,/kind:'task_work_session_v1',task_client_key:task\.id/);
 assert.match(core,/mutation\('event','create',null,item,'manual'\)/);
 assert.match(core,/Sesiones ya reservadas/);
 assert.match(desk,/data-desk-plan-task/);
 assert.match(desk,/application\/x-minds-task/);
 assert.match(desk,/planTaskSession\?\.\(id,prefs\.selectedDate,time\)/);
 assert.match(sync,/metadata:e\.metadata\|\|\{\}/);
 assert.match(desk,/Number\(e\.duration\|\|0\)/);
});
test('all clickable task checks are circular, cache includes all upgraded assets',()=>{
 assert.match(styles,/\.desk-task-check \{/);
 assert.match(styles,/aspect-ratio:1\/1!important/);
 assert.match(styles,/border-radius:50%!important/);
 assert.match(html,/dashboard-fixes\.css\?v=1/);
 assert.match(html,/dashboard\.js\?v=7/);
 assert.match(sw,/dashboard-fixes\.css\?v=1/);
 assert.match(sw,/dashboard\.js\?v=7/);
});
