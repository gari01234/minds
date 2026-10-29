import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('.github/workflows/ios-testflight.yml');
const ci = read('.github/workflows/ios-native.yml');
const project = read('apps/isabella-ios/project.yml');
const archive = read('apps/isabella-ios/Config/archive-for-testflight.sh');
const validator = read('apps/isabella-ios/Config/verify-testflight-signing.py');

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
  assert.ok(validator.includes('"MINDSShare.appex", "MINDSWidget.appex"'));
});

test('Native App, Share and Widget have distinct IDs and consistent App Group', () => {
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID)"'));
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID).share"'));
  assert.ok(project.includes('PRODUCT_BUNDLE_IDENTIFIER: "$(MINDS_BUNDLE_ID).widget"'));
  assert.equal(project.split('group.$(MINDS_BUNDLE_ID)').length - 1, 6);
  assert.ok(project.includes('      - target: MINDSShare\n        embed: true'));
  assert.ok(project.includes('      - target: MINDSWidget\n        embed: true'));
  assert.ok(archive.includes('MINDS_BUNDLE_ID="$APP_BUNDLE_ID"'));
  assert.equal(project.split('CFBundleShortVersionString: "$(MARKETING_VERSION)"').length - 1, 2);
  assert.equal(project.split('CFBundleVersion: "$(CURRENT_PROJECT_VERSION)"').length - 1, 2);
});

test('Device archive preserves entitlements offline; verified distribution export must precede upload', () => {
  for(const setting of ['CODE_SIGN_STYLE=Automatic', 'CODE_SIGN_IDENTITY=-',
    'AD_HOC_CODE_SIGNING_ALLOWED=YES', '-alltargets -showBuildSettings -json'])
    assert.ok(archive.includes(setting), 'Missing archive setting: ' + setting);
  assert.doesNotMatch(archive, /-allowProvisioningUpdates|-authenticationKey|CODE_SIGNING_ALLOWED=NO/);
  assert.ok(ci.includes('bash Config/archive-for-testflight.sh'));
  assert.ok(workflow.includes('bash Config/archive-for-testflight.sh'));
  assert.ok(workflow.includes('<key>destination</key><string>export</string>'));
  assert.ok(workflow.indexOf('verify-testflight-signing.py distribution') < workflow.indexOf('altool --upload-app'));
  assert.ok(workflow.includes('API_PRIVATE_KEYS_DIR:'));
});

test('Distribution gate rejects development/ad hoc profiles, wrong teams and missing Widget App Group', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import copy, datetime, importlib.util
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
team, bundle, group = 'A123456789', 'com.minds.preview.widget', 'group.com.minds.preview'
ent = {'application-identifier': team + '.' + bundle, m.TEAM: team, m.GROUPS: [group], 'get-task-allow': False, 'beta-reports-active': True}
profile = {'TeamIdentifier': [team], 'ExpirationDate': datetime.datetime.now() + datetime.timedelta(days=1), 'Entitlements': ent}
m.validate_distribution(profile, ent, bundle, group, team)
cases = []
for key, value in [('ProvisionedDevices', ['fake-device']), ('ProvisionsAllDevices', True), ('TeamIdentifier', ['WRONGTEAM0']), ('ExpirationDate', datetime.datetime(2000, 1, 1))]:
    p = copy.deepcopy(profile); p[key] = value; cases.append((p, ent))
for key, value in [(m.GROUPS, []), ('get-task-allow', True), ('application-identifier', team + '.wrong'), (m.TEAM, 'WRONGTEAM0')]:
    e = copy.deepcopy(ent); e[key] = value; cases.append((profile, e))
    p = copy.deepcopy(profile); p['Entitlements'][key] = value; cases.append((p, ent))
p = copy.deepcopy(profile); del p['Entitlements']['beta-reports-active']; cases.append((p, ent))
for p, e in cases:
    try: m.validate_distribution(p, e, bundle, group, team)
    except ValueError: pass
    else: raise AssertionError('Invalid signing accepted')
`], {cwd: new URL('../', import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('macOS reads the real certificate authority from signed code without Apple credentials',
  {skip: process.platform !== 'darwin'}, () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
# Use an Apple-signed system binary: this catches -dv omitting the Authority fields.
authority = m.signing_authority('/usr/bin/codesign')
assert authority, 'Failed to read the certificate chain of a signed macOS binary'
assert not authority.startswith(('Apple Distribution:', 'iPhone Distribution:')), 'System code is not our distribution identity'
`], {cwd: new URL('../', import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('Bundle metadata rejects the three omissions reported by Apple in run #4', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import copy, importlib.util
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
rule = {'NSExtensionActivationSupportsText': True, **{'NSExtensionActivationSupports' + kind + 'WithMaxCount': 1 for kind in ('WebURL', 'Image', 'File')}}
share = {'CFBundleDisplayName': 'Window', 'NSExtension': {'NSExtensionAttributes': {'NSExtensionActivationRule': rule}}}
for target in m.TARGETS:
    info = share if target == 'MINDSShare' else {'CFBundleDisplayName': 'Window'}
    m.validate_metadata(info, target)
    bad = copy.deepcopy(info); del bad['CFBundleDisplayName']
    try: m.validate_metadata(bad, target)
    except ValueError: pass
    else: raise AssertionError('Missing display name accepted: ' + target)
for attributes in (rule, {'NSExtensionActivationRule': 'TRUEPREDICATE'}, {'NSExtensionActivationRule': {}}):
    bad = copy.deepcopy(share); bad['NSExtension']['NSExtensionAttributes'] = attributes
    try: m.validate_metadata(bad, 'MINDSShare')
    except ValueError: pass
    else: raise AssertionError('Invalid activation rule accepted')
`], {cwd: new URL('../', import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('Signing diagnostics distinguish retained hashes and Unicode mismatches without logging names', () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util, json, unicodedata
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
authority = 'Apple Distribution: Synthetic Società (A123456789)'
cn = unicodedata.normalize('NFD', authority)
summary = m.requirement_summary('designated => certificate leaf[subject.CN] = 0x' + cn.encode().hex(), authority)
assert summary['uses_certificate_cn'] and not summary['cn_matches_authority'] and summary['cn_matches_after_nfc']
assert 'Synthetic' not in json.dumps(summary)
summary = m.requirement_summary('designated => certificate leaf[subject.CN] = "' + authority + '"', authority)
assert summary['cn_matches_authority']
assert m.requirement_summary('designated => cdhash H"1234"', '')['uses_cdhash']
`], {cwd: new URL('../', import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('macOS rejects a valid seal with an unsatisfied designated requirement before upload',
  {skip: process.platform !== 'darwin'}, () => {
  const result = spawnSync('python3', ['-B', '-c', `
import importlib.util, subprocess, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temp:
    source, binary = Path(temp) / 'main.c', Path(temp) / 'fixture'
    source.write_text('int main(void) { return 0; }')
    subprocess.run(['xcrun', 'clang', str(source), '-o', str(binary)], check=True, capture_output=True)
    for identifier in ('com.minds.fixture', 'com.minds.wrong'):
        subprocess.run(['codesign', '--force', '--sign', '-', '--identifier', 'com.minds.fixture',
                        '--requirements', '=designated => identifier "' + identifier + '"', str(binary)], check=True, capture_output=True)
        # The previous gate accepts both seals, including the intentionally bad DR.
        subprocess.run(['codesign', '--verify', '--strict', str(binary)], check=True, capture_output=True)
        if identifier == 'com.minds.fixture':
            m.verify_signature(binary)
        else:
            try: m.verify_signature(binary)
            except ValueError as error:
                assert 'does not satisfy its designated Requirement' in str(error), str(error)
            else: raise AssertionError('Unsatisfied designated requirement accepted')
`], {cwd: new URL('../', import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
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
