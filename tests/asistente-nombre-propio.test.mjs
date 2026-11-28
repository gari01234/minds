// Each Office member names the assistant (Gari, 28.11.2026: «a todos por default KI-Assistent y que cada quien pueda
// escoger el suyo»; his: «Samantha», «Sam» for short). The choice lives in the member's own preferences
// (assistant_name: name, spitzname, rufname); Window keeps Isabella and reads nothing. Checked without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assistantIdentity,profileAssistantForUser,profileOwnerForUser,resolveAssistantProfile,ASSISTANT_NAME_KEY} from '../supabase/functions/_shared/assistant-profile.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('a name of their own, a nickname and how it calls them; anything odd falls back to «KI-Assistent»',()=>{
  assert.equal(resolveAssistantProfile('office').assistant_name,'KI-Assistent');
  assert.equal(resolveAssistantProfile('office').assistant_id,'romy','the stable id of stored rows does not change');
  assert.deepEqual(assistantIdentity({name:'Samantha',spitzname:'Sam'},'office'),{name:'Samantha',nickname:'Sam',callme:null});
  assert.deepEqual(assistantIdentity(null,'office'),{name:'KI-Assistent',nickname:null,callme:null});
  assert.equal(assistantIdentity({name:'<b>Sam</b>'},'office').name,'KI-Assistent');
  assert.equal(assistantIdentity({name:'x'.repeat(41)},'office').name,'KI-Assistent');
  assert.equal(assistantIdentity({name:'Sam',spitzname:'Sam'},'office').nickname,null,'a nickname equal to the name is no nickname');
  assert.equal(assistantIdentity({name:'Jöran-Ève'},'office').name,'Jöran-Ève');
  assert.equal(assistantIdentity({rufname:'Gari'},'office').callme,'Gari');
  assert.deepEqual(assistantIdentity({name:'Samantha'},'window'),{name:'Isabella',nickname:null,callme:null},'Window keeps Isabella');
});

const fake=(rows)=>({from(table){
  const q={filters:[],select(){return q},eq(...a){q.filters.push(a);return q},
    async maybeSingle(){return {data:rows[table]?.(q.filters)??null,error:null}}};
  return q;
}});

test('the choice is read from the member\'s own preference; how it calls them replaces the first name',async()=>{
  const sb=fake({
    office_members:()=>({display_name:'Edgar Martínez',is_active:true}),
    isabella_preferences:f=>f.some(x=>x[0]==='preference_key'&&x[1]===ASSISTANT_NAME_KEY)?{value:{name:'Samantha',spitzname:'Sam',rufname:'Gari'}}:null
  });
  assert.deepEqual(await profileAssistantForUser(sb,'u1','office'),{name:'Samantha',nickname:'Sam',callme:'Gari'});
  assert.equal(await profileOwnerForUser(sb,'u1','office'),'Gari');
  const plain=fake({office_members:()=>({display_name:'Edgar Martínez',is_active:true}),isabella_preferences:()=>null});
  assert.equal(await profileOwnerForUser(plain,'u1','office'),'Edgar');
  assert.deepEqual(await profileAssistantForUser(plain,'u1','office'),{name:'KI-Assistent',nickname:null,callme:null});
  const broken={from(){throw new Error('offline')}};
  assert.equal((await profileAssistantForUser(broken,'u1','office')).name,'KI-Assistent','a failed read falls back');
  assert.equal((await profileAssistantForUser(broken,'u1','window')).name,'Isabella','Window never reads');
});

test('a new name renames her pages instead of adding new ones; her fixed lines carry no name',()=>{
  const dream=read('supabase/functions/_shared/isabella-dream.mjs');
  assert.match(dream,/const single=\['gari','relacion','isabella'\]\.includes\(p&&p\.tipo\);/);
  assert.match(dream,/single\?exQuery\.order\('updated_at',\{ascending:false\}\)\.limit\(1\):exQuery\.eq\('normalized_name',normalized\)/);
  assert.match(dream,/update\(\{name,\.\.\.\(single\?\{normalized_name:normalized\}:\{\}\)/);
  const voice=read('supabase/functions/_shared/assistant-voice.mjs');
  assert.doesNotMatch(voice,/\bRomy\b/);
  assert.match(voice,/Ich beende gerade die vorherige Antwort\. Warte bitte kurz, bevor du die nächste Nachricht sendest\./);
  const chat=read('supabase/functions/isabella-chat/index.ts');
  assert.match(chat,/author:assistantProfile\.assistant_id,/);
});

test('no Office text still calls the assistant «Romy»: the voice, the Live lines, the shared Akte-Pflege and the policy',async()=>{
  const {officeVoiceInstructions}=await import('../supabase/functions/_shared/office-live-policy.mjs');
  const {OFFICE_PFLEGE_INSTRUCTIONS}=await import('../supabase/functions/_shared/akte-pflege.mjs');
  const {OFFICE_RELATIONSHIP_POLICY}=await import('../supabase/functions/_shared/assistant-profile.mjs');
  assert.match(officeVoiceInstructions('Alex','Samantha'),/^Du heißt Samantha und bist die virtuelle Assistenz im TBA Office\./);
  assert.match(officeVoiceInstructions('Alex'),/^Du heißt KI-Assistent /);
  assert.match(officeVoiceInstructions('Alex'),/duze sie/);
  // Shared project data stays neutral: every member reads it, each with an assistant of their own.
  assert.match(OFFICE_PFLEGE_INSTRUCTIONS,/Du bist die KI-Assistenz für gemeinsam berechtigte Office-Projektakten\./);
  for(const text of [officeVoiceInstructions('Alex'),OFFICE_PFLEGE_INSTRUCTIONS,OFFICE_RELATIONSHIP_POLICY,read('apps/isabella/live/canonical.js')])
    assert.doesNotMatch(text,/\bRomy\b/);
  const canonical=read('apps/isabella/live/canonical.js');
  assert.match(canonical,/'Ich habe dir den Vorschlag im Chat zur Bestätigung vorbereitet\.'/);
  assert.match(canonical,/'Ich konnte keine Änderung bestätigen\. Schau dir das Ergebnis bitte im Chat an\.'/);
});
