import test from 'node:test';
import {officeIngestAuthorized} from '../supabase/functions/_shared/office-akte-access.mjs';
import assert from 'node:assert/strict';
import {
  PFLEGE_INSTRUCTIONS,OFFICE_PFLEGE_INSTRUCTIONS,trustedPflegeWorkflow,
  trustedOfficePflegeWorkflow,officeAkteProposals,collectOfficeAkteSources,
  runOfficeAktePflege
} from '../supabase/functions/_shared/akte-pflege.mjs';

const P='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const Q='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';

function fakeClient(rows){
  const seen=[];
  return {seen,from(table){
    const filters=[];
    const q={
      select(columns){seen.push({table,columns});return q},
      eq(k,v){filters.push(x=>x[k]===v);return q},
      in(k,v){filters.push(x=>v.includes(x[k]));return q},
      gt(k,v){filters.push(x=>x[k]>v);return q},
      order(){return q},limit(){return q},
      then(resolve,reject){return Promise.resolve({data:(rows[table]||[]).filter(x=>filters.every(f=>f(x))),error:null}).then(resolve,reject)}
    };
    return q;
  }};
}
test('Office Akte reads indexed project materials only, not another project or private thread',async()=>{
  const files=[
    {id:'file-p',user_id:A,project_id:P,name:'Fixture P.pdf',source_kind:'pdf',index_status:'indexed',updated_at:'2026-11-08T09:00:00Z',metadata:{}},
    {id:'file-q',user_id:B,project_id:Q,name:'Fixture Q.pdf',source_kind:'pdf',index_status:'indexed',updated_at:'2026-11-08T09:00:00Z',metadata:{}},
    {id:'private',user_id:A,project_id:P,name:'Private.txt',source_kind:'text',index_status:'indexed',updated_at:'2026-11-08T09:00:00Z',metadata:{visibility:'private'}}
  ];
  const sb=fakeClient({minds_work_files:files,minds_work_source_segments:[
    {file_id:'file-p',project_id:P,source_version:'a'.repeat(64),segment_no:0,content:'Termin laut fiktiver Quelle: 2026-11-15.',locator:{page:2}},
    {file_id:'file-q',project_id:Q,source_version:'b'.repeat(64),segment_no:0,content:'Nicht im Projekt P',locator:{page:3}}
  ]});
  const result=await collectOfficeAkteSources(sb,P,'2026-11-01T00:00:00Z');
  assert.deepEqual(result.map(x=>x.datei),['Fixture P.pdf']);
  assert.deepEqual(result[0].seiten,[2]);
  assert.doesNotMatch(JSON.stringify(result),/Projekt Q|Nicht im Projekt P/);
  assert.ok(sb.seen.every(x=>!['conversations','conversation_messages','minds_work_threads'].includes(x.table)));
  assert.match(sb.seen.find(x=>x.table==='minds_work_source_segments').columns,/locator/);
  assert.doesNotMatch(sb.seen.find(x=>x.table==='minds_work_source_segments').columns,/metadata/);
});
test('Only explicitly dated, source-grounded claims become unconfirmed proposals',()=>{
  const source={id:'file-p',source_version:'a'.repeat(64),datei:'Fixture P.pdf',text:'Frist für den Test ist der 15.11.2026. Die Entscheidung liegt noch nicht vor.'};
  const output=officeAkteProposals({
    fristen:[
      {titel:'Testfrist',datum:'2026-11-15',quelle:'Fixture P.pdf',grund:'Explizit genannt',zitat:'Frist für den Test ist der 15.11.2026.'},
      {titel:'Verfälschter Termin',datum:'2026-11-16',quelle:'Fixture Q.pdf',grund:'Nicht vorhanden',zitat:'Verfälschte Quelle'},
      {titel:'Ohne Quellenangabe',datum:'2026-11-16',quelle:'Fixture P.pdf',zitat:''}
    ],
    entscheidungen:[{titel:'Freigabe',quelle:'Fixture P.pdf',zitat:'Die Entscheidung liegt noch nicht vor.'}]
  },[source],['Freigabe']);
  assert.equal(output.length,1);
  assert.equal(output[0].memory_type,'deadline');
  assert.equal(output[0].source_file_id,'file-p');
  assert.equal(output[0].date,'2026-11-15');
  assert.equal(output[0].quote,'Frist für den Test ist der 15.11.2026.');
});
test('Office Pflege uses German-neutral instructions and its own OIDC, Window untouched',()=>{
  assert.match(PFLEGE_INSTRUCTIONS,/Isabella/);
  assert.match(OFFICE_PFLEGE_INSTRUCTIONS,/Romy/);
  assert.doesNotMatch(OFFICE_PFLEGE_INSTRUCTIONS,/Gari|Isabella|Spanisch/);
  const office={repository:'TBArchitekten/tbarchitekten.github.io',ref:'refs/heads/main',
    workflow_ref:'TBArchitekten/tbarchitekten.github.io/.github/workflows/romy-akte-pflege.yml@refs/heads/main',event_name:'schedule',run_id:'12345'};
  assert.equal(trustedOfficePflegeWorkflow(office),true);
  assert.equal(trustedOfficePflegeWorkflow({...office,repository:'gari01234/minds'}),false);
  assert.equal(trustedOfficePflegeWorkflow({...office,ref:'refs/heads/test'}),false);
  assert.equal(trustedPflegeWorkflow(office),false);
});
test('Office Akte never writes anything for projects with no active team',async()=>{
  const rows={
    office_projects:[{id:P,name:'Projekt P',status:'aktiv'}],
    office_project_members:[{project_id:P,user_id:A}],
    office_members:[{user_id:A,is_active:false}]
  };
  const sb=fakeClient(rows);
  sb.rpc=()=>{throw Error('must not claim an inactive project')};
  const r=await runOfficeAktePflege({sb,callModel:async()=>{throw Error('must not call model')},now:new Date('2026-11-08T12:00:00Z')});
  assert.equal(r.ok,true);
  assert.equal(r.model_runs,0);
  assert.deepEqual(r.projects,[{status:'no_active_team'}]);
});

test('Office Docling ingestion rejects revoked member, wrong project and foreign files',async()=>{
  const job={project_id:P,user_id:A,file_id:'file-p'};
  const make=(memberActive=true,fileUser=A,projectStatus='aktiv',teamAllowed=true)=>{
    const data={
      office_project_members:teamAllowed?[{project_id:P,user_id:A}]:[],
      office_members:[{user_id:A,is_active:memberActive}],
      office_projects:[{id:P,status:projectStatus}],
      minds_work_files:[{id:'file-p',user_id:fileUser,project_id:P}]
    };
    const sb={from(table){
      const filters=[];
      const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},
        async maybeSingle(){return {data:(data[table]||[]).find(x=>filters.every(f=>f(x)))||null,error:null}}};
      return q;
    }};
    return sb;
  };
  assert.equal(await officeIngestAuthorized(make(),job),true);
  assert.equal(await officeIngestAuthorized(make(false),job),false);
  assert.equal(await officeIngestAuthorized(make(true,A,'archiviert'),job),false);
  assert.equal(await officeIngestAuthorized(make(true,A,'aktiv',false),job),false);
  assert.equal(await officeIngestAuthorized(make(true,B),job),false);
  assert.equal(await officeIngestAuthorized(make(),{...job,project_id:Q}),false);
  assert.equal(await officeIngestAuthorized(make(),{...job,file_id:'another'}),false);
});
