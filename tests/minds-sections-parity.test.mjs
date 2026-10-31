import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('apps/isabella/minds-sections-parity.css');
const theoryCss=read('apps/theory/minds-parity.css');
const index=read('apps/isabella/index.html');
const theory=read('apps/theory/index.html');
const sw=read('apps/isabella/sw.js');
const app=read('apps/isabella/app.js');
const work=read('apps/isabella/work.js');

test('Section parity is the last Isabella stylesheet, offline, and Readings loads its own parity layer last',()=>{
  assert.match(index,/minds-detail-parity\.css\?v=1">\s*<link rel="stylesheet" href="\.\/minds-sections-parity\.css\?v=1">\s*<\/head>/);
  assert.match(sw,/minds-detail-parity\.css\?v=1',\s*'\.\/minds-sections-parity\.css\?v=1'/);
  assert.ok(theory.indexOf('design-system.css?v=2')<theory.indexOf('minds-parity.css?v=1'));
  for(const sheet of [css,theoryCss])assert.doesNotMatch(sheet,/@import|@font-face|url\(/);
});

test('Shell: full-height sidebar edge and one active-item style in every section',()=>{
  assert.match(css,/body\.desk-enabled \.app::before\{[^}]*grid-column:1;grid-row:1;/);
  assert.match(css,/body\.desk-enabled \.lens-nav-item\.active \.lens-glyph\{color:#007aff\}/);
});

test('Tabs, segments and buttons reuse the Planner controls',()=>{
  assert.match(css,/\.situation-tabs button\.active\{\s*color:#007aff;\s*border-bottom-color:#007aff;/);
  assert.match(css,/\.cal-toolbar \.segments button\.active\{[^}]*background:#fff;[^}]*color:#1d1d1f;/);
  assert.match(css,/\.app\.app :is\(\.calendar-create-row button,\[data-work-upload\],\[data-work-new-thread\],\[data-knowledge-new\]\)\{[^}]*background:#007aff;/);
  assert.match(css,/:is\(\.surface-readmore,\.surface-discuss,\.surface-why\)\{[^}]*border:0;/);
  assert.match(theoryCss,/\.v09-reading-filters button\.active\{\s*color:#007aff;/);
  assert.match(theoryCss,/\.v09-reading-actions button\{[^}]*border-radius:11px;/);
});

test('Calendar selection is blue everywhere and day events read from the top',()=>{
  assert.match(css,/--m-calendar-selected:#007aff;/);
  assert.match(css,/\.mc\.selected \.mn\{\s*background:#007aff;/);
  assert.match(css,/\.hours \.event\{[^}]*justify-content:flex-start;/);
  assert.match(css,/#calTitle::first-letter\{text-transform:uppercase\}/);
});

test('Weather uses vector symbols while keeping the tested emoji mapping',()=>{
  assert.ok(app.includes('function weatherSymbolSvg(symbol)'));
  assert.ok(app.indexOf('function weatherSymbolSvg(')<app.indexOf('function weatherConditionEmoji('));
  assert.ok(app.includes("weatherSymbolSvg('📍')"));
  assert.ok(app.includes('weatherSymbolSvg(weatherSymbol)'));
  assert.ok(!app.includes('aria-hidden="true">📍</span>'));
});

test('Reactions: wider catalogue, real recents, vector tabs, larger applied badge',()=>{
  const start=app.indexOf('const REACTION_CATEGORIES=['),end=app.indexOf('];',start);
  const cats=new Function('return '+app.slice(start+'const REACTION_CATEGORIES='.length,end+1))();
  assert.ok(cats.length>=10);
  assert.ok(cats.reduce((n,c)=>n+c.items.length,0)>=400);
  assert.equal(cats[0].id,'recent');
  for(const c of cats)assert.ok(app.includes(c.id+":'<"),'tab icon for '+c.id);
  assert.ok(app.includes("const REACTION_RECENT_KEY='isabella-recent-reactions'"));
  assert.ok(app.includes('if(m.reaction)rememberReaction(m.reaction);'));
  assert.ok(app.includes("(cat.id==='recent'?recentReactions():cat.items)"));
  assert.ok(app.includes('const scale=compact?.27:.42;'));
  assert.match(css,/\.emoji-sheet-tabs\{[^}]*grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
});

test('Work Desktop tiles, Threads previews and Panorama provenance read cleanly',()=>{
  assert.ok(work.includes("function workTileIcon(kind,f=null)"));
  assert.ok(work.includes("${workTileIcon('folder')}"));
  assert.ok(!work.includes('<span class="work-file-icon">▰</span>'));
  assert.ok(work.includes('${esc(workFileTypeLabel(f))} · '));
  assert.ok(work.includes('workPlainPreview(preview)'));
  const plain=new Function(work.slice(work.indexOf('function workPlainPreview('),work.indexOf('\nasync function renderDesktop(')) +';return workPlainPreview;')();
  assert.equal(plain('Sí, puedo consultar el **Desktop**, ver `x` y [esto](https://a.b).'),'Sí, puedo consultar el Desktop, ver x y esto.');
  assert.ok(work.includes("provenanceNames[x.provenance_class]||x.provenance_class||'Origen sin clasificar'"));
  for(const hook of ['data-work-folder','data-work-file','data-work-up','data-work-upload','data-work-new-folder','data-work-new-thread'])
    assert.ok(work.includes(hook),hook);
});

test('Motion and contrast preferences are honoured',()=>{
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-contrast:more/);
  assert.match(theoryCss,/prefers-reduced-motion:reduce/);
});
