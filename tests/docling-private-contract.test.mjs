import test from 'node:test';
import assert from 'node:assert/strict';
import {doclingConnection,validDoclingTaskId,doclingTaskState,doclingConvertResult} from '../supabase/functions/_shared/work-docling-contract.mjs';
test('Docling connection requires an authenticated HTTPS origin',()=>{
 const key='x'.repeat(48);
 assert.deepEqual(doclingConnection('https://docling.example.org/',key),
  {origin:'https://docling.example.org',key});
 assert.equal(doclingConnection('http://docling.example.org/',key),null);
 assert.equal(doclingConnection('https://docling.example.org/v1',key),null);
 assert.equal(doclingConnection('https://docling.example.org/','short'),null);
 assert.equal(doclingConnection(undefined,key),null);
});
test('Docling task states and result data are checked',()=>{
 assert.equal(validDoclingTaskId('7d92aa71-7cf5-4d8e-91d0-23d011a83d7a'),true);
 assert.equal(validDoclingTaskId('invalid/route'),false);
 assert.deepEqual(doclingTaskState({task_id:'task_12345678',task_status:'pending'}),{kind:'pending',taskId:'task_12345678'});
 assert.deepEqual(doclingTaskState({task_id:'task_12345678',task_status:'success'}),{kind:'ready',taskId:'task_12345678'});
 assert.throws(()=>doclingTaskState({task_id:'task_12345678',task_status:'failure'}));
 const result=doclingConvertResult({status:'partial_success',document:{md_content:'Some text',json_content:'{"texts":[]}' }});
 assert.equal(result.partial,true);
 assert.deepEqual(result.document,{texts:[]});
 assert.throws(()=>doclingConvertResult({status:'failure'}));
});
