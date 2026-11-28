// Un solo motor (28.11.2026): Romy's capabilities (files, evaluations) used Sol in her former engine since Gari's
// decision of 27.11 («no solo conmigo, haz el cambio para todos»), but Astra in this one. Now the profile decides:
// Office → GPT-6.2 Sol, Window → GPT-6 Astra as before; the secret OPENAI_CAPABILITY_MODEL overrides both.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runtime=readFileSync(new URL('../supabase/functions/_shared/capability-runtime.ts',import.meta.url),'utf8');

test('the capability model follows the profile, with a secret to override it',()=>{
  assert.match(runtime,/export const GENERAL_EXECUTION_MODEL=envValue\("OPENAI_CAPABILITY_MODEL"\)\|\|\n\s+\(envValue\("ASSISTANT_PROFILE"\)\.toLowerCase\(\)==="office"\?"gpt-6\.2-sol":"gpt-6-astra"\);/);
  assert.match(runtime,/const envValue=\(key:string\)=>\{try\{return String\(\(globalThis as any\)\.Deno\?\.env\?\.get\?\.\(key\)\|\|""\)\.trim\(\)\}catch\{return ""\}\};/);
  // Effort and tools stay as they are; Sol accepts both (checked on OpenAI's model pages on 27.11.2026).
  assert.match(runtime,/reasoning:\{effort:"medium",summary:"auto"\}/);
  assert.match(runtime,/tools:\[\{type:"code_interpreter",container:\{type:"auto",memory_limit:"4g"\}\}\]/);
});
