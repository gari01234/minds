import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const config=JSON.parse(read('apps/isabella-presence/src-tauri/tauri.conf.json'));
const workflow=read('.github/workflows/windows-presence-installer.yml');
const doc=read('apps/isabella/BUILD-80.1.md');

test('Build 80.1 enables an NSIS installer without changing Presence authority',()=>{
  assert.equal(config.version,'0.1.1');
  assert.equal(config.bundle.active,true);
  assert.deepEqual(config.bundle.targets,['nsis']);
  assert.ok(config.bundle.icon.includes('icons/icon.ico'));
  assert.ok(doc.includes('exclusivamente distribución de la shell de Build 80'));
});

test('Windows installer workflow is deterministic and publishes an exe artifact',()=>{
  assert.ok(workflow.includes('runs-on: windows-latest'));
  assert.ok(workflow.includes('node-version: "24"'));
  assert.ok(workflow.includes('dtolnay/rust-toolchain@1.90.0'));
  assert.ok(workflow.includes('@tauri-apps/cli@2.12.0 build --bundles nsis'));
  assert.ok(workflow.includes('actions/upload-artifact@v4'));
  assert.ok(workflow.includes('Isabella-Presence-Windows-0.1.1'));
  assert.ok(workflow.includes('bundle/nsis/*.exe'));
  assert.ok(!workflow.includes('service_role'));
  assert.ok(!workflow.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
