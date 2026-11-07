import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const backend = read('apps/isabella-ios/Sources/Services/BackendClient.swift');
const model = read('apps/isabella-ios/Sources/AppModel.swift');
const tabs = read('apps/isabella-ios/Sources/Features/Ahora/MainTabView.swift');
const dayTask = read('apps/isabella-ios/Sources/Services/DayTask.swift');
const appJs = read('apps/isabella/app.js');
const css = read('apps/isabella/minds-calendar-shell.css');

test('Ahora and the Bandeja in the app are the web sections, the same as on the desktop', () => {
  for (const gone of ['AhoraView', 'BandejaView', 'AhoraModels', 'WindowStyle'])
    assert.ok(!existsSync(new URL('../apps/isabella-ios/Sources/Features/Ahora/' + gone + '.swift', import.meta.url)), gone + ' is gone');
  assert.match(tabs, /page\(\.ahora, "Ahora"\)/);
  assert.match(tabs, /page\(\.bandeja, "Bandeja"\)/);
  assert.match(model, /case \.ahora: return "feed"/);
  assert.match(model, /case \.bandeja: return "bandeja"/);
  assert.match(model, /case "ideas" where account == \.personal: tab = \.bandeja; pendingWebExtra\["view"\] = "ideas"/);
  assert.doesNotMatch(model, /reloadAhora|reloadBandeja|akteEntries|FeedItem/);
});

test('The Bandeja badge counts exactly what the web counts as «Por confirmar»', () => {
  const count = backend.slice(backend.indexOf('func openProposalCount'), backend.indexOf('// Decisions from outside the page'));
  assert.match(count, /"eq\.proposed"/);
  assert.match(count, /"in\.\(deadline,decision,commitment,open_question\)"/);
  assert.match(count, /case "deadline", "decision": return true/);
  assert.match(count, /case "commitment": return kind == "aufgabe"/);
  assert.match(count, /case "open_question": return kind == "widerspruch"/);
  // The same rule on the web (Panorama «Para ti» and the Bandeja).
  const work = read('apps/isabella/work.js');
  assert.match(work, /r\.memory_type==='open_question'&&r\.status==='proposed'&&r\.metadata\?\.kind==='widerspruch'/);
  assert.match(work, /r\.memory_type==='commitment'&&r\.status==='proposed'&&r\.metadata\?\.kind==='aufgabe'/);
  // The page's count wins while it is open; the app counts on launch and when it comes back.
  assert.match(model, /webPortal\.onBadge = \{ \[weak self\] count in self\?\.openProposals = count \}/);
  assert.match(tabs, /if phase == \.active \{ Task \{ await model\.refreshBadge\(\) \} \}/);
  assert.match(model, /openProposals = 0/);
});

test('Decisions outside the page keep Panorama\'s rules (for the notification actions)', () => {
  const decide = backend.slice(backend.indexOf('func decideAkteEntry'), backend.indexOf('func akteEntryToTask'));
  assert.match(decide, /\["confirmed", "rejected", "resolved"\]\.contains\(status\)/);
  assert.match(decide, /\.init\(name: "status", value: "eq\.proposed"\)/, 'only while still proposed');
  assert.match(decide, /prefer: "return=representation"/);
  assert.match(decide, /saved\.count == 1, saved\[0\]\["status"\] as\? String == status/);
  const toTask = backend.slice(backend.indexOf('func akteEntryToTask'), backend.indexOf('func dayTasks'));
  assert.match(toTask, /entry\["status"\] as\? String == "proposed"/);
  assert.match(toTask, /"metadata": \["source": "akte_pflege", "memory_id": id\]/);
  assert.ok(toTask.indexOf('isabella_tasks') < toTask.lastIndexOf('"status": "confirmed"'), 'the entry is confirmed only after the task exists');
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

test('Siri lists the day\'s tasks like the web app (due today, plus open tasks whose window spans today)', () => {
  const day = backend.slice(backend.indexOf('func dayTasks'), backend.indexOf('func history'));
  assert.match(day, /"\(due_date\.eq\.\\\(today\),and\(start_date\.lte\.\\\(today\),due_date\.gt\.\\\(today\),completed_at\.is\.null\)\)"/);
  assert.match(day, /"archived_at", value: "is\.null"/);
  assert.match(day, /if a\.done != b\.done \{ return !a\.done \}/);
  assert.match(day, /if a\.isSpan != b\.isSpan \{ return !a\.isSpan \}/);
  assert.match(dayTask, /parts\.append\("en curso hasta " \+ until\)/);
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
