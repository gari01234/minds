import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Romy's notifications on the iPhone (TBA Office, 27.11.2026). Gari: «sí para que pueda hacerlo, para cuando tenga
// algo que decirme (Romy)», native push as decided on 25.11: Apple only carries «Romy · Neue Mitteilung», the text
// travels sealed with this iPhone's key. The office side is TBArchitekten/tbarchitekten.github.io (office-push).
const ios = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path, ios), "utf8");
const key = read("OfficePush/OfficePushKey.swift");
const nse = read("NotificationExtension/OfficeNotificationService.swift");
const delegate = read("Sources/Services/OfficePushRegistration.swift");
const app = read("Sources/AppModel.swift");
const session = read("Sources/Services/OfficeSession.swift");
const entry = read("Sources/MINDSApp.swift");
const tabs = read("Sources/Features/Ahora/MainTabView.swift");
const project = read("project.yml");
const appInfo = read("Config/App-Info.plist");
const python = code => spawnSync("python3", ["-B", "-c", code], { cwd: new URL("../", import.meta.url), encoding: "utf8" });

test("the key: created once by the app, in the shared Keychain group, readable while locked, never in a backup", () => {
  assert.match(key, /forInfoDictionaryKey: "MINDSKeychainGroup"/);
  assert.match(key, /value\.hasSuffix\("\.push"\), !value\.hasPrefix\("\."\), !value\.contains\("\$\("\)/, "no team, no key (simulator)");
  assert.match(key, /SymmetricKey\(size: \.bits256\)/);
  assert.match(key, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(key, /kSecAttrAccessGroup as String: group/);
  assert.match(key, /data\.count == 32/);
  // Nonce ‖ ciphertext ‖ tag, as office-push (core.mjs) seals it; the fields of `inhalt`.
  assert.match(key, /AES\.GCM\.SealedBox\(combined: data\)/);
  assert.match(key, /AES\.GCM\.open\(box, using: key\)/);
  for (const field of ["t: String", "b: String", "z: String?", "k: String?", "i: String?"]) assert.ok(key.includes("let " + field), field);
  assert.doesNotMatch(key + nse, /\bprint\(|NSLog|os_log|Logger\(/, "nothing about keys or texts in the log");
});

test("the extension opens the text on the iPhone and otherwise shows what Apple carried", () => {
  assert.match(nse, /final class OfficeNotificationService: UNNotificationServiceExtension/);
  assert.match(nse, /request\.content\.mutableCopy\(\) as\? UNMutableNotificationContent/);
  assert.match(nse, /content\.userInfo\["e"\] as\? String, let key = OfficePushKey\.load\(\),\s*let message = OfficePushMessage\.open\(sealed, with: key\)/);
  assert.match(nse, /info\.removeValue\(forKey: "e"\)/);
  assert.match(nse, /content\.threadIdentifier = "romy"/);
  assert.match(nse, /override func serviceExtensionTimeWillExpire\(\) \{\n\s*if let deliver, let original \{ deliver\(original\) \}/);
  assert.doesNotMatch(nse, /URLSession|UserDefaults|FileManager|loadOrCreate/, "the extension only reads the key");
});

test("the app registers only with the office signed in, once a day or when something changed, and forgets on sign-out", () => {
  assert.match(entry, /@UIApplicationDelegateAdaptor\(WindowAppDelegate\.self\) private var appDelegate/);
  assert.match(app, /func syncOfficePush\(\) async \{\n\s*guard await office\.isSignedIn, OfficePushKey\.group != nil else \{ return \}/);
  assert.match(app, /if status == \.notDetermined \{\n\s*_ = try\? await center\.requestAuthorization\(options: \[\.alert, \.sound, \.badge\]\)/);
  assert.match(app, /UIApplication\.shared\.registerForRemoteNotifications\(\)/);
  assert.match(app, /guard !OfficePushRegistration\.isCurrent\(stamp\) else \{ return \}/);
  assert.match(app, /await syncOfficeShare\(\)\n\s*await syncOfficePush\(\)\n\s*if let token = WindowAppDelegate\.takePendingToken\(\)/);
  assert.match(app, /officePortal\.reloadIfStarted\(\)\n\s*await syncOfficeShare\(\)\n\s*await syncOfficePush\(\)/, "right after signing in");
  assert.match(tabs, /await model\.syncOfficeShare\(\); await model\.syncOfficePush\(\)/, "and when the app comes back");
  // Sign-out: unregister with the still valid session first, then delete the key.
  const out = app.slice(app.indexOf("func logoutOffice()"));
  assert.ok(out.indexOf("unregisterPushDevice") < out.indexOf("OfficePushKey.delete()"));
  assert.ok(out.indexOf("OfficePushKey.delete()") < out.indexOf("await office.logout()"));
  assert.match(delegate, /return 86_400|< 86_400/);
  assert.match(delegate, /#if DEBUG\n\s*return "development"\n\s*#else\n\s*return "production"/);
});

test("the office functions and their parameters, exactly as the office migration defines them", () => {
  assert.match(session, /"rest\/v1\/rpc\/office_push_geraet_anmelden", method: "POST"/);
  assert.match(session, /\["p_geraet_id": deviceID, "p_token": token, "p_umgebung": environment,\s*"p_bundle_id": bundleID, "p_schluessel": key, "p_app_version": appVersion\]/);
  assert.match(session, /"rest\/v1\/rpc\/office_push_geraet_abmelden", method: "POST",\s*json: \["p_geraet_id": deviceID\]/);
  assert.match(session, /let access = try await valid\(\)\.accessToken/, "with the refreshed access token, never the refresh token");
  assert.doesNotMatch(session.slice(session.indexOf("func registerPushDevice")), /refreshToken\]|"refresh_token":/);
});

test("a tap on Romy's notification opens Romy in the office account; other notifications open the app as before", () => {
  assert.match(delegate, /\(response\.notification\.request\.content\.userInfo\["o"\] as\? NSNumber\)\?\.intValue == 1/);
  assert.match(delegate, /if let open = Self\.onOpenOffice \{ open\(\) \} else \{ Self\.pendingOpen = true \}/);
  assert.match(delegate, /completionHandler\(\[\.banner, \.list, \.sound\]\)/);
  assert.match(app, /func openOfficeFromNotification\(\) \{\n\s*if account != \.office \{ switchAccount\(to: \.office\) \}\n\s*open\(section: "assistant"\)/);
  assert.match(app, /if WindowAppDelegate\.takePendingOpen\(\) \{ openOfficeFromNotification\(\) \}/);
});

test("project: a fourth target, the same Keychain group in app and extension, APNs production on the app", () => {
  const group = '"$(DEVELOPMENT_TEAM).$(MINDS_BUNDLE_ID).push"';
  assert.equal(project.split("- " + group).length - 1, 2, "app and extension entitlements");
  assert.ok(project.includes("MINDSKeychainGroup: " + group));
  assert.ok(appInfo.includes("<key>MINDSKeychainGroup</key>\n\t<string>$(DEVELOPMENT_TEAM).$(MINDS_BUNDLE_ID).push</string>"));
  assert.match(project, /aps-environment: production/);
  const target = project.slice(project.indexOf("  MINDSNotifications:"));
  assert.match(target, /type: app-extension/);
  assert.match(target, /NSExtensionPointIdentifier: com\.apple\.usernotifications\.service/);
  assert.match(target, /NSExtensionPrincipalClass: "\$\(PRODUCT_MODULE_NAME\)\.OfficeNotificationService"/);
  assert.match(target, /PRODUCT_BUNDLE_IDENTIFIER: "\$\(MINDS_BUNDLE_ID\)\.notifications"/);
  assert.match(target, /APPLICATION_EXTENSION_API_ONLY: YES/);
  assert.doesNotMatch(target, /application-groups|aps-environment/, "no App Group (not assignable by API) and no APNs of its own");
  assert.ok(project.includes("      - target: MINDSNotifications\n        embed: true"));
  assert.match(project, /      - OfficeShared\n      - OfficePush\n      - Localization\/App/);
});

test("signing gate: the extension without App Group, the Keychain group granted, Push production on the app", () => {
  const result = python(`
import copy, datetime, importlib.util
spec = importlib.util.spec_from_file_location('signing', 'apps/isabella-ios/Config/verify-testflight-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
team, app, group = 'A123456789', 'com.minds.preview', 'group.com.minds.preview'
kc = team + '.com.minds.preview.push'
assert m.TARGETS['MINDSNotifications'] == '.notifications' and 'MINDSNotifications' not in m.GROUP_TARGETS
later = datetime.datetime.now() + datetime.timedelta(days=1)
def profile(bundle, extra):
    ent = {'application-identifier': team + '.' + bundle, m.TEAM: team, 'get-task-allow': False, 'beta-reports-active': True,
           'keychain-access-groups': [team + '.*'], **extra}
    return {'TeamIdentifier': [team], 'ExpirationDate': later, 'Entitlements': ent}
nse = app + '.notifications'
p = profile(nse, {})
e = {'application-identifier': team + '.' + nse, m.TEAM: team, 'get-task-allow': False, m.KEYCHAIN: [kc]}
m.validate_distribution(p, e, nse, group, team, 'MINDSNotifications', app)
bad = []
for key, value in [(m.KEYCHAIN, ['OTHERTEAM1.com.minds.preview.push']), (m.KEYCHAIN, []), (m.GROUPS, [group])]:
    x = copy.deepcopy(e); x[key] = value; bad.append((p, x, nse, 'MINDSNotifications'))
q = copy.deepcopy(p); q['Entitlements']['keychain-access-groups'] = ['OTHERTEAM1.*']; bad.append((q, e, nse, 'MINDSNotifications'))
pa = profile(app, {m.GROUPS: [group], m.PUSH: 'production'})
ea = {'application-identifier': team + '.' + app, m.TEAM: team, 'get-task-allow': False, m.GROUPS: [group], m.KEYCHAIN: [kc], m.PUSH: 'production'}
m.validate_distribution(pa, ea, app, group, team, 'MINDS', app)
x = copy.deepcopy(ea); x[m.PUSH] = 'development'; bad.append((pa, x, app, 'MINDS'))
x = copy.deepcopy(ea); del x[m.PUSH]; bad.append((pa, x, app, 'MINDS'))
q = copy.deepcopy(pa); del q['Entitlements'][m.PUSH]; bad.append((q, ea, app, 'MINDS'))
for prof, ent, bundle, target in bad:
    try: m.validate_distribution(prof, ent, bundle, group, team, target, app)
    except ValueError: pass
    else: raise AssertionError('accepted: ' + target + ' ' + repr(ent.get(m.KEYCHAIN)) + ' ' + repr(ent.get(m.PUSH)))
info = {'CFBundleDisplayName': 'Window', 'NSExtension': {'NSExtensionPointIdentifier': 'com.apple.usernotifications.service',
        'NSExtensionPrincipalClass': 'MINDSNotifications.OfficeNotificationService'}}
m.validate_metadata(info, 'MINDSNotifications')
for wrong in ({'CFBundleDisplayName': 'Window'}, {'CFBundleDisplayName': 'Window', 'NSExtension': {'NSExtensionPointIdentifier': 'com.apple.widgetkit-extension'}}):
    try: m.validate_metadata(wrong, 'MINDSNotifications')
    except ValueError: pass
    else: raise AssertionError('not a notification extension accepted')
m.validate_runtime_config({'MINDSKeychainGroup': kc}, 'MINDSNotifications', app, team)
try: m.validate_runtime_config({'MINDSKeychainGroup': '.com.minds.preview.push'}, 'MINDSNotifications', app, team)
except ValueError: pass
else: raise AssertionError('Keychain group without team accepted')
`);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test("local signing: APNs and the Keychain group only as the profile grants them; CI registers what is missing", () => {
  const result = python(`
import importlib.util, json
spec = importlib.util.spec_from_file_location('local', 'apps/isabella-ios/Config/asc-local-signing.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
team, app = 'A123456789', 'com.minds.preview'
assert m.SUFFIXES == ('', '.share', '.widget', '.notifications') and m.REGISTERED_BY_CI == ('.notifications',)
kc = [team + '.com.minds.preview.push']
profile = {'application-identifier': team + '.' + app, 'beta-reports-active': True, 'aps-environment': 'production',
           'keychain-access-groups': [team + '.*'], 'com.apple.security.application-groups': ['group.' + app]}
ent = m.distribution_entitlements({'aps-environment': 'development', 'keychain-access-groups': kc,
                                   'com.apple.security.application-groups': ['group.' + app]}, profile, team, app)
assert ent['aps-environment'] == 'production', 'the profile decides the APNs environment'
assert ent['keychain-access-groups'] == kc
for archived, prof in [({'aps-environment': 'production'}, {k: v for k, v in profile.items() if k != 'aps-environment'}),
                       ({'keychain-access-groups': ['OTHERTEAM1.com.minds.preview.push']}, profile),
                       ({'keychain-access-groups': kc}, {**profile, 'keychain-access-groups': ['OTHERTEAM1.*']})]:
    try: m.distribution_entitlements(archived, prof, team, app)
    except SystemExit: pass
    else: raise AssertionError('not granted, but accepted: ' + json.dumps(archived))
# ensure_identifiers: registers the extension's App ID and enables Push only when missing.
calls = []
def fake(existing, capabilities):
    m.list_all = lambda path: capabilities if '/bundleIdCapabilities' in path else [
        {'id': 'id-' + i, 'attributes': {'identifier': i}} for i in existing]
    m.call = lambda method, path, body=None, missing_ok=False: calls.append((method, path, body)) or {'data': {'id': 'new-id'}}
fake([app, app + '.share', app + '.widget'], [])
m.ensure_identifiers(app)
assert [c[1] for c in calls] == ['/bundleIds', '/bundleIdCapabilities'], calls
assert calls[0][2]['data']['attributes'] == {'identifier': app + '.notifications', 'name': 'Window Notifications', 'platform': 'IOS'}
assert calls[1][2]['data']['attributes'] == {'capabilityType': 'PUSH_NOTIFICATIONS'}
assert calls[1][2]['data']['relationships']['bundleId']['data']['id'] == 'id-' + app
calls.clear()
fake([app, app + '.share', app + '.widget', app + '.notifications'], [{'attributes': {'capabilityType': 'PUSH_NOTIFICATIONS'}}])
m.ensure_identifiers(app)
assert calls == [], 'nothing twice'
`);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const signing = read("Config/asc-local-signing.py");
  assert.ok(signing.indexOf("ensure_identifiers(bundle)") < signing.indexOf("certificateType"), "before any certificate is created");
});
