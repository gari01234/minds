// Gari, 27.11.2026: the calendar opens on today at every launch (not on the last day looked at). Left open past
// midnight, a calendar that showed «today» moves to the new day; a day chosen on purpose stays.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('desk and calendar start on today',()=>{
  const dash=read('apps/isabella/dashboard.js'),app=read('apps/isabella/app.js');
  assert.match(dash,/const start = \{navCollapsed:true,selectedDate:M\.dayKey\(new Date\(\)\)\};\n    try \{ return \{\.\.\.M\.sanitizePreferences\(JSON\.parse\(localStorage\.getItem\(KEY\) \|\| 'null'\)\),\.\.\.start\}; \}\n    catch \{ return \{\.\.\.M\.defaultPreferences\(\),\.\.\.start\}; \}/);
  assert.match(app,/x\.date=today\(\);return x\n\}catch\{return JSON\.parse\(JSON\.stringify\(base\)\)\}\}/);
});

test('past midnight «today» follows, a chosen day stays',()=>{
  const dash=read('apps/isabella/dashboard.js'),app=read('apps/isabella/app.js');
  assert.match(dash,/const wasToday = prefs\.selectedDate === todayKey;\n    todayKey = now;\n    if \(!wasToday\) return;/);
  assert.match(app,/const now=today\(\);if\(now!==calendarToday\)\{const wasToday=state\.date===calendarToday;calendarToday=now;if\(wasToday\)\{state\.date=now;save\(\);if\(state\.screen==='calendar'\)renderCalendar\(\)\}\}/);
  const html=read('apps/isabella/index.html'),sw=read('apps/isabella/sw.js');
  for(const v of ['app.js?v=150','dashboard.js?v=8'])assert.ok(html.includes(v)&&sw.includes(v),v);
  assert.match(sw,/isabella-shell-v195/);
});
