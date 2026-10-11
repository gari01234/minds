import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromSheetRows,fromDoclingDocument} from '../supabase/functions/_shared/work-text-segments.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Excel segments retain verified sheet and row range, without inventing Claims',()=>{
  const result=fromSheetRows([{name:'Raumprogramm',rows:[
    {row:2,cells:[{address:'A2',text:'Raum'},{address:'B2',text:'Fläche'}]},
    {row:3,cells:[{address:'A3',text:'Foyer'},{address:'B3',text:'120'}]}
  ]}]);
  assert.equal(result.coverage,'complete_text');
  assert.deepEqual(result.segments[0].locator,{sheet:'Raumprogramm',row_start:2,row_end:3,verified:true});
  assert.match(result.segments[0].content,/A3: Foyer/);
  assert.match(result.segments[0].content,/B3: 120/);
});
test('Docling provenance uses pages only when emitted by source',()=>{
  const r=fromDoclingDocument('Fallback',[].length?{}:{texts:[
    {text:'Westfassade',prov:[{page_no:2}]},
    {text:'Schnitt A',prov:[{page_no:3}]}]});
  assert.equal(r.locator_class,'pdf_page');
  assert.deepEqual(r.segments.map(s=>s.locator.page),[2,3]);
  const unknown=fromDoclingDocument('Ohne Seite',null);
  assert.equal(unknown.locator_class,'unverified_page');
  assert.equal(unknown.segments[0].locator.page_verified,false);
});
test('Partial input remains partial and segments have unique sequential indices',()=>{
  const a=fromSheetRows([{name:'Planliste',rows:[{row:1,cells:[{address:'A1',text:'Position'}]}]}],{truncated:true});
  assert.equal(a.coverage,'partial_text');
  assert.deepEqual(a.segments.map(x=>x.segment_no),[0]);
  const b=fromDoclingDocument('Fallback',{texts:[{text:'Inhalt',prov:[{page_no:1}]}]},{partial:true});
  assert.equal(b.coverage,'partial_text');
});
test('Source segments are private and only materialized by service-role RPC',()=>{
  const sql=[
  'supabase/migrations/20261011165747_work_source_segments_tables_v01.sql',
  'supabase/migrations/20261011165758_work_source_segments_commit_v01.sql',
  'supabase/migrations/20261011165808_work_source_segments_search_v01.sql'
].map(read).join('\n');
  assert.match(sql,/minds_work_source_segments_owner_select/);
  assert.match(sql,/using\(user_id=\(select auth.uid\(\)\)\)/);
  assert.match(sql,/revoke all on function public.minds_commit_work_source_segments/);
  assert.match(sql,/to service_role/);
  assert.match(sql,/minds_search_work_source_segments/);
  assert.match(sql,/s.user_id=\(select auth.uid\(\)\)/);
  assert.doesNotMatch(sql,/insert into public.minds_work_claims/);
});
test('Work runner preserves existing metadata and Chat distinguishes extracted text from accepted decisions',()=>{
  const core=read('supabase/functions/_shared/work-ingest-core.ts');
  const runner=read('supabase/functions/isabella-work-ingest-runner/index.ts');
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(core,/materializeWorkSourceText/);
  assert.match(runner,/\.\.\.\(x.file\?\.metadata\?\.knowledge_intake\|\|\{\}\)/);
  assert.match(chat,/minds_search_work_source_segments/);
  assert.match(chat,/source_segments:/);
  assert.match(chat,/extracted_original_text_not_confirmed/);
  assert.match(chat,/Si locator.page_verified es false/);
});

test('Docling preserves Markdown-only captions and unlocated elements without inventing page numbers',()=>{
  const md='## Hauptüberschrift\\nWestfassade\\nNicht zugeordnete Bildunterschrift';
  const x=fromDoclingDocument(md,{texts:[
    {text:'Westfassade',prov:[{page_no:2}]},
    {text:'Text ohne Seitenreferenz',prov:[]}
  ]});
  assert.equal(x.coverage,'partial_text');
  assert.equal(x.locator_class,'pdf_page');
  const located=x.segments.filter(s=>s.segment_kind==='page_text');
  const unlocated=x.segments.filter(s=>s.segment_kind==='unpaged_text');
  assert.equal(located.length,1);
  assert.deepEqual(located[0].locator,{page:2,verified:true});
  assert.ok(unlocated.length>=1);
  assert.ok(unlocated.every(s=>s.locator.page_verified===false));
  assert.ok(unlocated.some(s=>s.content.includes('Bildunterschrift')));
  assert.equal(x.metadata.unlocated_elements,1);
  assert.ok(x.metadata.unverified_segments>=1);
});
test('Docling page-complete text does not create a spurious unverified fallback',()=>{
  const x=fromDoclingDocument('Westfassade',{texts:[{text:'Westfassade',prov:[{page_no:2}]}]});
  assert.equal(x.coverage,'complete_text');
  assert.equal(x.segments.length,1);
  assert.equal(x.segments[0].locator.page,2);
});
