import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture({connected=true,fail=[]}={}){
  const source=read('apps/isabella/situation.js');
  const node={innerHTML:'',querySelector(){return {addEventListener(){}}}};
  const mockQuery=name=>{
    const q={};
    for(const method of ['select','eq','is','not','lte','in','order','limit'])q[method]=()=>q;
    q.then=(resolve,reject)=>{
      const outcome=fail.includes(name)?{data:null,error:{message:'offline'}}:
      name==='isabella_tasks'?{data:[{id:'one',title:'Coordinar TWP',due_date:'2026-10-09',project_id:'project-uuid-bernried'}],count:1,error:null}:
      name==='isabella_projects'?{data:[{id:'project-uuid-bernried',name:'Bernried'}],count:1,error:null}:
      name==='minds_expectations'?{data:[{id:'two',title:'Esperar respuesta',due_at:'2026-10-08',status:'due_unconfirmed'}],count:1,error:null}:
      name==='minds_attention_events'?{data:[],count:0,error:null}:
      {data:null,count:2,error:null};
      Promise.resolve(outcome).then(resolve,reject);
    };
    return q;
  };
  const sb={auth:{getSession:async()=>({data:{session:connected?{user:{id:'owner-1'}}:null}})},from:mockQuery};
  const window={MINDS_SUPABASE:sb,ISABELLA_STATE:{projects:[]}};
  const document={querySelector:s=>s==='#situationLedger'?node:null};
  vm.runInNewContext(source,{window,document,Promise,Date,console});
  return {node,render:window.MINDS_SITUATION.render};
}
test('Ahora keeps the source-backed signals (Avisos) next to the day, suggestions move to the Bandeja',()=>{
 const shell=read('apps/isabella/shell.js');
 const app=read('apps/isabella/app.js');
 const index=read('apps/isabella/index.html');
 assert.ok(shell.includes('id="situationLedger"'));
 assert.ok(shell.indexOf('id="situationLedger"')<shell.indexOf('id="ahoraDay"'));
 assert.ok(shell.indexOf('id="bandejaScreen"')<shell.indexOf('id="feedList"'),'Suggestions live in the Bandeja');
 assert.ok(index.includes('situation.js?v=6'));
 assert.ok(app.includes('void window.MINDS_SITUATION?.render?.()'));
 assert.ok(app.includes('aria-label="Sugerencias de Isabella"'));
 assert.ok(!app.includes('Ahora mismo no hay nada que merezca interrumpirte.'));
});
test('Avisos do not infer an empty world from no account',async()=>{
 const {render,node}=fixture({connected:false});
 await render();
 assert.match(node.innerHTML,/Memoria no conectada/);
 assert.doesNotMatch(node.innerHTML,/No hay tareas fechadas/);
});
test('Avisos keep due_unconfirmed distinct from non-occurrence; tasks are in «Hoy», not here',async()=>{
 const {render,node}=fixture();
 await render();
 assert.match(node.innerHTML,/Esperar respuesta/);
 assert.match(node.innerHTML,/Vencida, ocurrencia no confirmada/);
 assert.match(node.innerHTML,/2 propuestas de acción esperan tu confirmación/);
 assert.doesNotMatch(node.innerHTML,/Coordinar TWP/);
});
test('Avisos report partial coverage instead of silently treating query failures as no items',async()=>{
 const {render,node}=fixture({fail:['minds_expectations','minds_attention_events']});
 await render();
 assert.match(node.innerHTML,/Cobertura parcial: 1 de tres fuentes/);
 assert.match(node.innerHTML,/No pude comprobar: respuestas esperadas, avisos/);
 assert.match(node.innerHTML,/Una omisión de MINDS no equivale a ausencia de obligaciones/);
});
test('Avisos stay empty when every source answers and nothing needs Gari',async()=>{
 const source=read('apps/isabella/situation.js');
 const node={innerHTML:'x',querySelector(){return null}};
 const q=()=>{const o={};for(const m of ['select','eq','is','not','in','order','limit','lte'])o[m]=()=>o;o.then=(r,j)=>Promise.resolve({data:[],count:0,error:null}).then(r,j);return o};
 const window={MINDS_SUPABASE:{auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:q}};
 vm.runInNewContext(source,{window,document:{querySelector:s=>s==='#situationLedger'?node:null},Promise,Date,console});
 await window.MINDS_SITUATION.render();
 assert.equal(node.innerHTML,'');
});
