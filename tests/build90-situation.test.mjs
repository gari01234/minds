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
      name==='isabella_tasks'?{data:[{id:'one',title:'Coordinar TWP',due_date:'2026-10-09',project_id:null}],count:1,error:null}:
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
test('Build 90.2 places a canonical source-backed radar before the generative Feed',()=>{
 const shell=read('apps/isabella/shell.js');
 const app=read('apps/isabella/app.js');
 const index=read('apps/isabella/index.html');
 assert.ok(shell.includes('id="situationLedger"'));
 assert.ok(shell.indexOf('id="situationLedger"')<shell.indexOf('id="feedList"'));
 assert.ok(index.includes('situation.js?v=2'));
 assert.ok(app.includes('void window.MINDS_SITUATION?.render?.()'));
 assert.ok(app.includes('feed-section-title">Sugerencias de Isabella'));
 assert.ok(!app.includes('Ahora mismo no hay nada que merezca interrumpirte.'));
});
test('Build 90.2 does not infer empty world from no account',async()=>{
 const {render,node}=fixture({connected:false});
 await render();
 assert.match(node.innerHTML,/Memoria no conectada/);
 assert.doesNotMatch(node.innerHTML,/No hay tareas fechadas/);
});
test('Build 90.2 keeps due_unconfirmed distinct from non-occurrence',async()=>{
 const {render,node}=fixture();
 await render();
 assert.match(node.innerHTML,/Coordinar TWP/);
 assert.match(node.innerHTML,/Esperar respuesta/);
 assert.match(node.innerHTML,/Vencida, ocurrencia no confirmada/);
 assert.match(node.innerHTML,/No incluye todas las conversaciones/);
});
test('Build 90.2 reports partial coverage instead of silently treating query failures as no items',async()=>{
 const {render,node}=fixture({fail:['minds_expectations','minds_attention_events']});
 await render();
 assert.match(node.innerHTML,/Cobertura parcial: 2 de cuatro fuentes/);
 assert.match(node.innerHTML,/Esta fuente no pudo comprobarse/);
 assert.doesNotMatch(node.innerHTML,/No hay sugerencias nuevas/);
});
