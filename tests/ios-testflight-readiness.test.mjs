import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('.github/workflows/ios-testflight.yml');
const ci = read('.github/workflows/ios-native.yml');
const project = read('apps/isabella-ios/project.yml');

test('Only an explicit upload mode can contact Apple', () => {
  for (const expected of [
    'workflow_dispatch:', 'default: preflight', '- preflight', '- upload',
    'needs: preflight', "inputs.mode == 'upload'", "github.ref == 'refs/heads/main'",
    'environment: apple-testflight', 'runs-on: macos-26',
    'CODE_SIGNING_ALLOWED=NO', 'major >= 26', 'app-store-connect',
    'Destroy temporary signing key'
  ]) assert.ok(workflow.includes(expected), 'Missing release gate: ' + expected);
  assert.ok(workflow.indexOf('distribute:') > workflow.indexOf('preflight:'));
  assert.ok(workflow.indexOf('environment: apple-testflight') > workflow.indexOf('distribute:'));
  assert.ok(workflow.indexOf('environment: apple-testflight') < workflow.indexOf('ASC_API_KEY_P8:'));
  assert.ok(!workflow.includes('<string>app-store</string>'), 'Deprecated export method');
});

test('Signing secrets remain environment-scoped and never enter build artifacts', () => {
  for(const name of ['ISABELLA_APPLE_TEAM_ID', 'ISABELLA_IOS_BUNDLE_ID',
      'ISABELLA_ASC_ISSUER_ID', 'ISABELLA_ASC_KEY_ID', 'ISABELLA_ASC_API_KEY_P8'])
    assert.ok(workflow.includes(name),'Unconfigured Apple setting '+name);
  assert.ok(workflow.includes('openssl pkey -in'));
  assert.ok(workflow.includes('chmod 600'));
  assert.ok(!workflow.includes('upload-artifact'));
  assert.ok(workflow.includes('test -d "$app/PlugIns/MINDSShare.appex"'));
  assert.ok(workflow.includes('test -d "$app/PlugIns/MINDSWidget.appex"'));
});

test('Native App, Share and Widget have distinct IDs and consistent App Group', () => {
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID)"'));
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID).share"'));
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID).widget"'));
  assert.equal(project.split('group.$(MINDS_BUNDLE_ID)').length - 1, 6);
  assert.ok(project.includes('      - target: MINDSShare\n        embed: true'));
  assert.ok(project.includes('      - target: MINDSWidget\n        embed: true'));
  assert.ok(workflow.includes('MINDS_BUNDLE_ID="$APP_BUNDLE_ID"'));
});

test('macOS 26 CI validates the distribution workflow without production credentials', () => {
  for(const required of ['runs-on: macos-26','ios-testflight.yml',
      'tests/ios-testflight-readiness.test.mjs','CODE_SIGNING_ALLOWED=NO']) {
    if(required==='CODE_SIGNING_ALLOWED=NO') {
      assert.ok(workflow.includes(required));
    } else assert.ok(ci.includes(required),'Missing CI check '+required);
  }
  assert.ok(ci.includes('node --test tests/ios-testflight-readiness.test.mjs'));
  assert.ok(ci.includes('xcodegen generate'));
  assert.ok(ci.includes('-sdk iphonesimulator'));
});

test('Window is installed under the approved visible name with a 1024px opaque App Store icon', () => {
  assert.ok(project.includes('INFOPLIST_KEY_CFBundleDisplayName: Window'));
  assert.ok(project.includes('ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon'));
  assert.ok(project.includes('      - Assets.xcassets'));
  const manifest = JSON.parse(read('apps/isabella-ios/Assets.xcassets/AppIcon.appiconset/Contents.json'));
  assert.equal(manifest.images[0].size, '1024x1024');
  assert.equal(manifest.images[0].filename, 'Window-AppIcon-1024.png');
  const script = read('apps/isabella-ios/Config/prepare-app-icon.sh');
  assert.ok(script.includes('icon-512.png'));
  assert.ok(script.includes('sips -s format jpeg -z 1024 1024'));
  assert.equal(workflow.split('bash Config/prepare-app-icon.sh').length - 1, 2);
  assert.ok(ci.includes('bash Config/prepare-app-icon.sh'));
});
