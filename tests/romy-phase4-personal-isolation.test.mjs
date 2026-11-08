import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTranscript,dreamCaller,DREAM_INSTRUCTIONS,dreamDue} from '../supabase/functions/_shared/isabella-dream.mjs';
import {presenceGate,PRESENCE_LIMITS} from '../supabase/functions/_shared/isabella-presence.mjs';
import {profileOwnerForUser,profileRelationshipPolicy,OFFICE_RELATIONSHIP_POLICY,profileInstructions} from '../supabase/functions/_shared/assistant-profile.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',INACTIVE='33333333-3333-4333-8333-333333333333';
const at='2026-11-07T11:00:00.000Z';
const tables={
  office_members:[
    {user_id:A,display_name:'Alex Beispiel',is_active:true},
    {user_id:B,display_name:'Mara Muster',is_active:true},
    {user_id:INACTIVE,display_name:'Inaktive Test',is_active:false}
  ],
  conversations:[{user_id:A,id:'aaa',app_scope:'isabella'},{user_id:B,id:'bbb',app_scope:'isabella'}],
  conversation_messages:[
    {id:'m1',user_id:A,conversation_id:'aaa',role:'user',content:'Fixture Alpha only',created_at:at,metadata:{},provisional:false,exposure_scope_version:1,exposure_scope_kind:'global'},
    {id:'m2',user_id:B,conversation_id:'bbb',role:'user',content:'Fixture Beta only',created_at:at,metadata:{},provisional:false,exposure_scope_version:1,exposure_scope_kind:'global'}
  ],
  minds_memory_forget_tombstones:[]
};
function db(){
  return {from(name){
    assert.ok(Object.hasOwn(tables,name),'Unexpected table '+name);
    const filters=[];
    const b={
      select(){return b;},
      eq(k,v){filters.push(r=>r[k]===v);return b},
      in(k,v){filters.push(r=>v.includes(r[k]));return b},
      gt(k,v){filters.push(r=>r[k]>v);return b},
      order(){return b},
      limit(){return b},
      async maybeSingle(){const arr=tables[name].filter(r=>filters.every(f=>f(r)));return {data:arr[0]||null,error:null}},
      then(resolve,reject){return Promise.resolve({data:tables[name].filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject)}
    };
    return b;
  }};
}
test('Office nightly transcript: independent, active owner; no second member text',async()=>{
  const sb=db();
  assert.equal(await profileOwnerForUser(sb,A,'office'),'Alex');
  assert.equal(await profileOwnerForUser(sb,B,'office'),'Mara');
  assert.equal(await profileOwnerForUser(sb,INACTIVE,'office'),null);
  const a=await collectTranscript(sb,A,'2026-11-06T00:00:00.000Z',{profile:'office',owner:'Alex'});
  const b=await collectTranscript(sb,B,'2026-11-06T00:00:00.000Z',{profile:'office',owner:'Mara'});
  assert.equal(a.messages.length,1);assert.equal(b.messages.length,1);
  assert.equal(a.messages[0].autor,'Alex');assert.equal(b.messages[0].autor,'Mara');
  assert.match(a.messages[0].texto,/Alpha/);assert.doesNotMatch(a.messages[0].texto,/Beta/);
  assert.match(b.messages[0].texto,/Beta/);assert.doesNotMatch(b.messages[0].texto,/Alpha/);
});
test('Office nightly model: individual prompts while Window instructions remain byte-identical',async()=>{
  const requests=[];
  const caller=dreamCaller('synthetic-test-key','fixture-model',async(_url,opts)=>{
    requests.push(JSON.parse(opts.body));
    return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{}'}]}]})};
  });
  await caller({});
  await caller({},{profile:'office',owner:'Alex Beispiel'});
  await caller({},{profile:'office',owner:'Mara Muster'});
  assert.equal(requests[0].instructions,DREAM_INSTRUCTIONS);
  assert.match(requests[1].instructions,/Romy/);
  assert.match(requests[1].instructions,/Alex/);
  assert.doesNotMatch(requests[1].instructions,/\bGari\b|\bIsabella\b|Mara Muster/);
  assert.match(requests[2].instructions,/Mara/);
  assert.doesNotMatch(requests[2].instructions,/\bGari\b|\bIsabella\b|Alex Beispiel/);
});
test('Presence budget is per member, respecting disable and quiet hours without push',()=>{
  const now=new Date('2026-11-08T11:00:00.000Z');
  const active={now,enabled:true,sentToday:false,hasMaterial:true,lastUserAt:null,lastAnyAt:null,state:{day:'2026-11-08',calls:0}};
  assert.equal(presenceGate(active).go,true);
  assert.equal(presenceGate({...active,enabled:false}).reason,'turned_off');
  assert.equal(presenceGate({...active,sentToday:true}).reason,'already_wrote_today');
  assert.equal(presenceGate({...active,state:{day:'2026-11-08',calls:PRESENCE_LIMITS.callsPerDay}}).reason,'call_budget');
  assert.equal(presenceGate({...active,now:new Date('2026-11-08T03:00:00.000Z')}).reason,'outside_hours');
  assert.equal(dreamDue({},now).go,false);
});
test('Office relationship cannot inherit Gari-specific rules; Window remains literal',()=>{
  const individual='Gari and Isabella have a special relationship.';
  assert.equal(profileRelationshipPolicy(individual,'window'),individual);
  assert.equal(profileRelationshipPolicy(individual,'office'),OFFICE_RELATIONSHIP_POLICY);
  assert.equal(profileInstructions(individual,'window'),individual);
});
