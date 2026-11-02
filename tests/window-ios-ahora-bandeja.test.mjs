import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const backend = read('apps/isabella-ios/Sources/Services/BackendClient.swift');
const model = read('apps/isabella-ios/Sources/AppModel.swift');
const bandeja = read('apps/isabella-ios/Sources/Features/Ahora/BandejaView.swift');
const ahora = read('apps/isabella-ios/Sources/Features/Ahora/AhoraView.swift');
const entries = read('apps/isabella-ios/Sources/Features/Ahora/AhoraModels.swift');
const appJs = read('apps/isabella/app.js');
const css = read('apps/isabella/minds-calendar-shell.css');

test('Bandeja decides exactly like Panorama and only counts what the backend confirmed', () => {
  const decide = backend.slice(backend.indexOf('func decideAkteEntry'), backend.indexOf('func akteEntryToTask'));
  assert.match(decide, /\["confirmed", "rejected", "resolved"\]\.contains\(status\)/);
  assert.match(decide, /\.init\(name: "status", value: "eq\.proposed"\)/, 'only while still proposed');
  assert.match(decide, /prefer: "return=representation"/);
  assert.match(decide, /saved\.count == 1, saved\[0\]\["status"\] as\? String == status/);
  assert.match(decide, /if status == "confirmed" \{ patch\["confirmed_at"\] = now \}/);
  const toTask = backend.slice(backend.indexOf('func akteEntryToTask'), backend.indexOf('func feedItems'));
  assert.match(toTask, /entry\["status"\] as\? String == "proposed"/);
  assert.match(toTask, /"rest\/v1\/isabella_tasks", method: "POST"/);
  assert.match(toTask, /"metadata": \["source": "akte_pflege", "memory_id": id\]/);
  assert.ok(toTask.indexOf('isabella_tasks') < toTask.lastIndexOf('"status": "confirmed"'), 'the entry is confirmed only after the task exists');
  assert.match(model, /Saved only when the backend confirms it/);
  assert.match(model, /catch \{\s*bandejaError = "No pude guardar la decisión: "/);
  // Same German actions as Panorama.
  for (const label of ['"Bestätigen"', '"Verwerfen"', '"Als Aufgabe anlegen"', '"Geklärt"', '"Kein Widerspruch"']) assert.ok(bandeja.includes(label), label);
});

test('Bandeja cards open to show why: the reason, the exact quote and the source', () => {
  assert.match(entries, /reason = \(json\["body"\] as\? String \?\? ""\)/);
  assert.match(entries, /quote = \(meta\["zitat"\] as\? String\)/);
  assert.match(bandeja, /Text\("POR QUÉ"\)/);
  assert.match(bandeja, /if open \{ why\(entry\) \}/);
  assert.match(bandeja, /design: \.serif/);
  assert.match(bandeja, /Esta propuesta es anterior a las explicaciones/);
  const pending = backend.slice(backend.indexOf('func pendingAkteEntries'), backend.indexOf('func upcomingFristen'));
  assert.match(pending, /"in\.\(deadline,decision,commitment,open_question\)"/);
  assert.match(pending, /isabella_projects\(name,client_key\)/);
});

test('Ahora: weather, Ideas as the web view, Fristen, today, Isabella\'s suggestions', () => {
  assert.match(ahora, /model\.feed\.first\(where: \\\.isWeather\)/);
  assert.match(ahora, /Picker\("Vista", selection: \$model\.ahoraMode\)/);
  assert.match(ahora, /WebTabView\(session: model\.webPortal, active: model\.tab == \.ahora && model\.ahoraMode == \.ideas\)/);
  for (const title of ['"Próximas Fristen"', '"Hoy"', '"Isabella sugiere"']) assert.ok(ahora.includes(title), title);
  assert.match(ahora, /model\.discuss\(item\)/);
  assert.match(model, /open\(section: "assistant", extra: \["draft": item\.prompt \?\? item\.title\]\)/);
  const feed = backend.slice(backend.indexOf('func feedItems'), backend.indexOf('func history'));
  assert.match(feed, /"eq\.feed"/);
  assert.match(feed, /generation == nil \|\| /, 'only the newest generation, like the web app');
});

test('the web page joins the app shell only when the app says it has tabs', () => {
  assert.match(appJs, /if\(!\(info\?\.app\?\.capabilities\|\|\[\]\)\.includes\('shell\.tabs'\)\)return;/);
  assert.match(css, /body\.window-app-shell \.app \.main-nav\{display:none!important\}/);
  assert.match(read('apps/isabella/shell.js'), /<button data-shell-nav="readings">Lecturas<\/button><button data-shell-nav="thoughts">Thoughts<\/button>/);
  // Run show() and the hash handler in a sandbox.
  const start = appJs.indexOf('const WINDOW_TAB_FOR=');
  const end = appJs.indexOf('function showSection(name,options={}){');
  const calls = [], shown = [];
  const ctx = {window: {WINDOW_NATIVE: {available: true, call: async (type, payload) => { calls.push([type, payload]); return {app: {capabilities: ['shell.tabs']}}; }}, addEventListener() {}, MINDS_WORK: {open: k => shown.push('project:' + k)}},
    document: {body: {classList: {add() {}}}, addEventListener() {}}, location: {hash: ''}, URLSearchParams, setTimeout: f => f(), Event: class { constructor(t) { this.type = t; } },
    $: () => null, $$: () => [], closeDrawer() {}, state: {}, showSection: n => shown.push(n)};
  vm.runInNewContext(appJs.slice(start, end) + ';this.show=show;this.applyWindowShellHash=applyWindowShellHash;this.initWindowShell=initWindowShell;this.setShell=v=>{windowShell=v};', ctx);
  ctx.show('calendar');
  assert.equal(JSON.stringify(shown), JSON.stringify(['calendar']), 'outside the app shell nothing changes');
  ctx.setShell(true);
  ctx.location.hash = '#section=assistant';
  ctx.applyWindowShellHash();
  ctx.show('calendar');
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['nav.open', {section: 'calendar'}]), 'a section of another tab is opened by the app');
  ctx.show('readings');
  assert.equal(shown.at(-1), 'readings', 'Lecturas stays inside the current tab');
  ctx.location.hash = '#section=work&project=bernried';
  ctx.applyWindowShellHash();
  assert.equal(JSON.stringify(shown.slice(-2)), JSON.stringify(['work', 'project:bernried']));
  ctx.location.hash = '#section=bandeja&view=ideas';
  ctx.applyWindowShellHash();
  assert.equal(shown.at(-1), 'bandeja', 'the Bandeja is a web section of its own tab');
  ctx.location.hash = '#section=assistant';
  ctx.applyWindowShellHash();
  ctx.show('ideas');
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['nav.open', {section: 'bandeja', view: 'ideas'}]), 'Ideas open in the Bandeja tab');
  const before = shown.length;
  ctx.location.hash = '#section=evil';
  ctx.applyWindowShellHash();
  assert.equal(shown.length, before, 'unknown sections are ignored');
});

test('Ahora lists the day\'s tasks like the web app (due today, plus open tasks whose window spans today)', () => {
  const day = backend.slice(backend.indexOf('func dayTasks'), backend.indexOf('func feedItems'));
  assert.match(day, /"\(due_date\.eq\.\\\(today\),and\(start_date\.lte\.\\\(today\),due_date\.gt\.\\\(today\),completed_at\.is\.null\)\)"/);
  assert.match(day, /"archived_at", value: "is\.null"/);
  assert.match(day, /if a\.done != b\.done \{ return !a\.done \}/);
  assert.match(day, /if a\.isSpan != b\.isSpan \{ return !a\.isSpan \}/);
  assert.match(entries, /parts\.append\("en curso hasta " \+ until\)/);
  assert.match(ahora, /ForEach\(Array\(model\.dayTasks\.enumerated\(\)\)/);
  assert.match(ahora, /min reservados"/);
  assert.match(model, /events = today\.filter \{ \$0\.sessionTaskKey == nil \}/);
  // The web rule it mirrors.
  const web = read('apps/isabella/dashboard-model.js');
  assert.match(web, /task\.startDate < task\.date && task\.startDate <= key && key < task\.date/);
});

test('Threads: the ••• button opens its actions (rename, archive)', () => {
  const work = read('apps/isabella/work.js');
  assert.match(work, /openThreadActions\(threads\.find\(x=>x\.id===b\.dataset\.workThreadActions\)\)/);
  assert.match(work, /data-work-thread-actions="\$\{t\.id\}"/);
  assert.match(work, /<button id="workThreadRename" class="secondary">Renombrar<\/button>/);
});
