// Conocimiento as fast triage: review by document, one-tap confirm/discard, bulk confirm, "A la Akte".
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const work=readFileSync(new URL('../apps/isabella/work.js',import.meta.url),'utf8');
const slice=work.slice(work.indexOf('// Conocimiento: triage by document.'),work.indexOf('async function loadFolders(){'));

function setup(){
  const calls=[],status=[];let html='';
  const claims=[
    {id:'c1',claim_type:'deadline',statement:'Rückmeldung zum Honorarangebot bis 15.11.2026.',status:'proposed',provenance_class:'project_source',confidence:0.7,updated_at:'2026-11-01',minds_work_evidence:[{source_file_id:'f1',excerpt:'bis zum 15.11.2026',stance:'supports',locator:{page:1}}]},
    {id:'c2',claim_type:'requirement',statement:'Sonderfachleute beauftragt die Gemeinde.',status:'proposed',provenance_class:'project_source',updated_at:'2026-11-01',minds_work_evidence:[{source_file_id:'f1',excerpt:'x',stance:'supports'}]},
    {id:'c3',claim_type:'fact',statement:'Alt',status:'confirmed',provenance_class:'user',updated_at:'2026-10-01',minds_work_evidence:[]}];
  const from=table=>{const b={select(){return b},eq(){return b},limit(){return Promise.resolve({data:[],error:null})},
    insert(row){calls.push({table,insert:row});return Promise.resolve({error:null})},update(p){calls.push({table,update:p});return {eq:()=>Promise.resolve({error:null})}}};return b};
  const ctx={knowledgeRows:claims,knowledgeFilter:'review',knowledgeQuery:'',projectModelSnapshot:null,files:[{id:'f1',name:'AW_ Honorar.pdf'}],project:{id:'p1',name:'Bernried'},
    provenanceNames:{project_source:'Fuente del proyecto'},crypto:{randomUUID:()=>'req'},
    sb:{from,rpc:async(name,args)=>{calls.push({rpc:name,args});return {data:{},error:null}}},
    esc:x=>String(x??''),akteDate:x=>String(x||'').slice(0,10),setStatus:m=>status.push(m),projectModelPanel:()=>'',
    knowledgeFlags:c=>({contradiction:c.status==='disputed',expired:false}),openFile(){},setTimeout,clearTimeout,
    $:sel=>sel==='#workBody'?{set innerHTML(v){html=v},get innerHTML(){return html}}:{},$$:()=>[],window:{}};
  vm.createContext(ctx);vm.runInContext(slice+';this.api={paintKnowledge,reviewKnowledge,knowledgeToAkte,knowledgeDateIn};',ctx);
  return {ctx,calls,status,html:()=>html,claims};
}

test('Triage view groups by document, offers bulk confirm and puts deadlines first in line for the Akte',()=>{
  const {ctx,html}=setup();ctx.$=sel=>sel==='#workBody'?{set innerHTML(v){ctx._h=v}}:{set onclick(v){}};
  ctx.api.paintKnowledge();const h=ctx._h;
  assert.match(h,/<strong>AW_ Honorar\.pdf<\/strong><span>2 por revisar<\/span>/);
  assert.match(h,/data-kn-bulk="f:f1">Confirmar las 2/);
  assert.match(h,/data-kn-akte="c1">Als Frist eintragen/);
  assert.ok(!h.includes('data-kn-akte="c2"'),'only decisions and deadlines go to the register');
  assert.match(h,/Por revisar<span>2<\/span>[\s\S]*Confirmadas<span>1<\/span>/);
  assert.match(h,/Origen: Fuente del proyecto/);
});

test('Reviews keep history through minds_save_work_claim; "A la Akte" files a confirmed Frist with its date and source',async()=>{
  const {ctx,calls,status,claims}=setup();
  await ctx.api.reviewKnowledge(['c2'],'rejected');
  const rpc=calls.find(c=>c.rpc==='minds_save_work_claim');
  assert.equal(rpc.args.p_confirmed,true);assert.equal(rpc.args.p_claim.id,'c2');assert.equal(rpc.args.p_claim.status,'rejected');
  assert.equal(claims[1].status,'rejected');
  await ctx.api.knowledgeToAkte('c1');
  const ins=calls.find(c=>c.table==='minds_work_memory'&&c.insert).insert;
  assert.equal(ins.memory_type,'deadline');assert.equal(ins.status,'confirmed');assert.equal(ins.occurred_at,'2026-11-15T12:00:00Z');
  assert.equal(ins.metadata.claim_id,'c1');assert.equal(ins.metadata.quelle,'AW_ Honorar.pdf');
  assert.equal(claims[0].status,'confirmed');assert.match(status.at(-1),/^Frist eingetragen/);
  assert.equal(ctx.api.knowledgeDateIn('bis 3.2.2027'),'2027-02-03');assert.equal(ctx.api.knowledgeDateIn('ohne Datum'),null);
});
