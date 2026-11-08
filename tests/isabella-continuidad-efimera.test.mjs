import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitDreamEvidence,nextState,yesterdayView,durableDream} from '../supabase/functions/_shared/dream-continuity.mjs';
import {consolidatedMemoryView,DREAM_SCHEMA,DREAM_INSTRUCTIONS} from '../supabase/functions/_shared/isabella-dream.mjs';
import {ISABELLA_CORE} from '../supabase/functions/_shared/isabella-core.mjs';
import {promptComponentSizes} from '../supabase/functions/_shared/light-conversation-context.mjs';
const at='2026-09-14T20:00:00Z',day='2026-09-14',now=Date.parse(at);
const utterance=(autor,texto)=>({at,cuando:day+' 22:00',autor,texto});
const sample=[utterance('Gari','Anoche no dormí en toda la noche.'),utterance('Isabella','Estoy cansada.'),utterance('Gari','Mi vecina está cansada.'),utterance('Gari','Revisemos el dibujo mañana.')];
const {transcript,quotes}=splitDreamEvidence(sample);
const candidate={fecha:day,texto:'Resumen inventado',cita:'[estado_0]',dias_vigencia:3};
test('estado copia únicamente una cita propia y caduca desde el momento original',()=>{
 assert.equal(quotes.length,1);assert.equal(quotes[0].cita,sample[0].texto);assert.equal(transcript[0].texto,'[estado_0]');
 for(const wrong of [{cita:'Texto del modelo'},{fecha:'2026-09-12'},{dias_vigencia:6}])assert.equal(nextState(null,[{...candidate,...wrong}],quotes,now).items.length,0);
 const value=nextState(null,[candidate],quotes,now);
 assert.equal(value.items[0].texto,sample[0].texto);
 const prefs=[{preference_key:'isabella_estado',value}];
 assert.equal(consolidatedMemoryView([],[],now+86400000,prefs).como_esta[0].cita,sample[0].texto);
 assert.equal(consolidatedMemoryView([],[],now+3*86400000,prefs).como_esta,undefined);
 assert.deepEqual(nextState({forgot_before:now+1000},[candidate],quotes,now).items,[]);
 assert.equal(durableDream({paginas:[{resumen:'[estado_0]'}],hipotesis:[{cita:'[estado_0]'}],diario:'[estado_0]'}).paginas.length,0);
});
test('ayer requiere conversación fechada; el contexto pierde su resumen a los dos días',()=>{
 const yesterday=yesterdayView({fecha:day,resumen:'A\nB\nC\nD',abierto:['A','B','C','D']},day,transcript);
 assert.equal(yesterday.resumen,'A\nB\nC');assert.equal(yesterday.abierto.length,3);
 assert.equal(yesterdayView({fecha:'2026-09-01',resumen:'falso'},day,transcript),null);
 assert.equal(consolidatedMemoryView([],[],Date.parse(yesterday.expires_at),[{preference_key:'isabella_ayer',value:yesterday}]).ayer,undefined);
});
test('panel y presencia usan las notas vigentes y los dos momentos de seguimiento',()=>{
 const ui=readFileSync(new URL('../apps/isabella/app.js',import.meta.url),'utf8');
 const presence=readFileSync(new URL('../supabase/functions/_shared/isabella-presence.mjs',import.meta.url),'utf8');
 assert.match(ui,/data-dream-clear-state/);assert.match(ui,/items:\[\],forgot_before:Date\.now\(\)/);
 assert.match(presence,/\.\.\.continuityView\(transient,stamp\)/);assert.match(presence,/\['app_abierta','cierre_del_dia'\]\.includes\(moment.kind\)/);
});
test('mide las instrucciones de chat y repaso y la carga adicional con una fixture',()=>{
 const fields=Object.keys(DREAM_SCHEMA.properties).filter(k=>!['estado','ayer','seguimientos'].includes(k));
 const oldSchema={...DREAM_SCHEMA,required:fields,properties:Object.fromEntries(fields.map(k=>[k,DREAM_SCHEMA.properties[k]]))};
 const item=structuredClone(oldSchema.properties.hipotesis.items); delete item.properties.episodios;item.required=item.required.filter(k=>k!=='episodios');oldSchema.properties.hipotesis={...oldSchema.properties.hipotesis,items:item};
 const state=nextState(null,[candidate],quotes,now);
 const yesterday=yesterdayView({fecha:day,resumen:'Quedó una pregunta sobre el dibujo.',abierto:['Revisar el detalle']},day,transcript);
 const prefs=[{preference_key:'isabella_estado',value:state},{preference_key:'isabella_ayer',value:yesterday}];
 const oldInput={transcripcion_nueva:sample},newInput={transcripcion_nueva:transcript,fecha_repasada:day,eventos_repasados:[{id:'evt',titulo:'Revisión de muestra',hora:'12:00'}]};
 const measure=(instructions,context,input,tools=[])=>Object.values(promptComponentSizes({instructions,context,input,tools})).slice(0,4);
 const before=measure(ISABELLA_CORE.split('\n').filter(l=>!/^[-] (como_esta|ayer):/.test(l)).join('\n'),consolidatedMemoryView([],[],now),['Consulta']);
 const after=measure(ISABELLA_CORE,consolidatedMemoryView([],[],now,prefs),['Consulta']);
 assert.ok(after[1]-before[1]<2000);
 console.log('caracteres',JSON.stringify({chat:[before,after],repaso:[measure(DREAM_INSTRUCTIONS.split('\n').filter(l=>!l.startsWith('En estado')&&!l.startsWith('En ayer')&&!l.startsWith('En la página relacion')).join('\n'),{},oldInput,[oldSchema]),measure(DREAM_INSTRUCTIONS,{},newInput,[DREAM_SCHEMA])]}));
});
