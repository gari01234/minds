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
  const sql=read('supabase/migrations/20261011183000_work_source_segments_v01.sql');
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
