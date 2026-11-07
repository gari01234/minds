import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ios = new URL("../apps/isabella-ios/", import.meta.url);
const read = path => readFileSync(new URL(path, ios), "utf8");
const portal = read("Sources/Features/Web/FullMINDSView.swift");
const app = read("Sources/AppModel.swift");
const shell = read("Sources/RootView.swift");
const project = read("project.yml");
const rootDoc = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const contract = readFileSync(new URL("../docs/IOS-FUNCTIONAL-PARITY-v0.1.md", import.meta.url), "utf8");

const bridge = read("Sources/Features/Web/WindowNativeBridge.swift");

const tabs = read("Sources/Features/Ahora/MainTabView.swift");

test("Window on iPhone: the app owns the session, its tab bar and the shared web page", () => {
  assert.match(shell, /MainTabView\(\)/);
  assert.match(shell, /NativeSignInView\(\)/);
  assert.match(shell, /model\.bootstrap\(\)/);
  assert.match(shell, /\.preferredColorScheme\(\.light\)/);
  assert.doesNotMatch(shell, /NavigationStack|MINDS completo/);
  for (const view of ["ContinuityView","ChatView","CalendarHomeView"])
    assert.doesNotMatch(shell + tabs, new RegExp(view + "\\(\\)"));
  // The UI-test shortcut exists only in Debug builds.
  assert.match(shell, /#if DEBUG\s+\/\/[^\n]*\n\s+static let webOnlyForUITests = ProcessInfo\.processInfo\.arguments\.contains\("-WindowUITestWebOnly"\)\s+#else\s+static let webOnlyForUITests = false/);
  // Gari's order: Chat (opens first) · Ahora · Tiempo · Work · Bandeja.
  // The office account (TBA Office, since 07.11.2026): Romy · Heute · Kalender · Work · Tools.
  const office = tabs.slice(tabs.indexOf("if model.account == .office {"), tabs.indexOf("} else {"));
  const personal = tabs.slice(tabs.indexOf("} else {"), tabs.indexOf(".id(model.account)"));
  const labelsOf = text => [...text.matchAll(/page\(\.(\w+), "([^"]+)"\)/g)].map(m => m[2]);
  assert.deepEqual(labelsOf(personal), ["Chat", "Ahora", "Tiempo", "Work", "Bandeja"]);
  assert.deepEqual(labelsOf(office), ["Chat", "Ahora", "Tiempo", "Work", "Tools"]);
  const labels = [...new Set(labelsOf(tabs))];
  assert.match(tabs, /\.tabItem \{ Image\(icon\) \}/);
  // Icons only, drawn like the web app's navigation (no SF Symbols, no titles).
  assert.doesNotMatch(tabs, /systemImage:|Label\(/);
  for (const name of labels) {
    const set = JSON.parse(read("Assets.xcassets/" + name + ".imageset/Contents.json"));
    assert.equal(set.properties["template-rendering-intent"], "template");
    const svg = read("Assets.xcassets/" + name + ".imageset/" + set.images[0].filename);
    assert.match(svg, /stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/);
  }
  const web = readFileSync(new URL("../apps/isabella/shell.js", import.meta.url), "utf8");
  assert.ok(web.includes('M21 11.5a8.38 8.38 0 0 1-.9 3.8') && read("Assets.xcassets/Chat.imageset/tab-chat.svg").includes('M21 11.5a8.38 8.38 0 0 1-.9 3.8'), "same chat icon as the web app");
  assert.match(app, /var tab: Tab = \.chat/);
  // Every tab is the shared web page: Ahora and the Bandeja are the same sections as on the desktop.
  assert.match(tabs, /WebTabView\(session: model\.activePortal, active: model\.tab == tab\)/);
  assert.match(app, /var activePortal: MINDSWebPortalSession \{ account == \.office \? officePortal : webPortal \}/);
  assert.doesNotMatch(tabs, /AhoraView|BandejaView/);
  assert.match(tabs, /page\(\.bandeja, "Bandeja"\)\s*\.badge\(model\.openProposals\)/);
  assert.match(tabs, /\.onChange\(of: model\.tab\) \{ _, _ in model\.showWebSection\(\) \}/);
  // Above the tab bar: build 14 drew the page under it and hid the chat composer.
  assert.equal((tabs.match(/\.ignoresSafeArea\(edges: \.top\)/g) || []).length, 1);
  assert.doesNotMatch(tabs, /\.ignoresSafeArea\(\)/);
  // One shared web view: the active tab takes it over (a UIView has one parent).
  assert.match(portal, /struct WebTabView: UIViewRepresentable/);
  assert.match(portal, /if web\.superview !== container \{\s*web\.removeFromSuperview\(\)/);
  assert.doesNotMatch(portal, /NavigationStack|MINDS completo|navigationTitle/);
  assert.match(portal, /contentInsetAdjustmentBehavior = \.never/);
  assert.match(portal, /applicationNameForUserAgent = "WindowApp\/1\.0"/);
  assert.match(portal, /func webViewWebContentProcessDidTerminate/);
  // The app picks the section by URL fragment: whitelisted, "+" encoded, no reload.
  assert.match(portal, /static func sectionURL\(_ section: String, extra: \[String: String\] = \[:\], home: URL = MINDSWebPortalSession\.homeURL,\s*allowed: \[String\] = \["assistant", "feed", "bandeja", "ideas", "work", "calendar", "readings", "thoughts"\]\) -> URL\? \{\s*guard allowed\.contains\(section\)/);
  assert.match(portal, /\? \["assistant", "feed", "calendar", "work", "tools", "projects", "plans"\]\s*: \["assistant", "feed", "bandeja", "ideas", "work", "calendar", "readings", "thoughts"\]/);
  assert.match(portal, /replacingOccurrences\(of: "\+", with: "%2B"\)/);
  // Made when the page is first shown, never at launch: AppModel exists before
  // UIApplicationMain, and a web view made then crashes UIKit on the first touch.
  assert.match(portal, /private var made: WKWebView\?/);
  assert.match(portal, /var webView: WKWebView \{\s*if let made \{ return made \}/);
  assert.doesNotMatch(portal, /let webView: WKWebView|override init\(\)/);
  assert.match(app, /webPortal\.sessionProvider = \{ \[backend\] in try await backend\.bridgeSession\(\) \}/);
  assert.match(app, /webPortal\.onNavigate = \{ \[weak self\] section, extra in self\?\.open\(section: section, extra: extra\) \}/);
  assert.match(app, /webPortal\.onBadge = \{ \[weak self\] count in self\?\.openProposals = count \}/);
  // Tab → web section, one table.
  for (const [tab, section] of [["chat", "assistant"], ["ahora", "feed"], ["tiempo", "calendar"], ["work", "work"], ["bandeja", "bandeja"]])
    assert.match(app, new RegExp('case \\.' + tab + ': return "' + section + '"'));
  assert.match(app, /webPortal\.reloadIfStarted\(\)/);
});

test("the typed bridge answers only the top-level MINDS page and never carries the refresh token", () => {
  assert.match(portal, /addScriptMessageHandler\(\s*bridge, contentWorld: \.page, name: WindowNativeBridge\.name\)/);
  assert.match(bridge, /static let name = "windowNative"/);
  assert.match(bridge, /static let version = 1/);
  // Only the top-level page of the portal's own account: MINDS (Persönlich) or TBA Office (Office).
  assert.match(bridge, /return frame\.isMainFrame && portal\.trusts\(frame\.securityOrigin\)/);
  assert.match(portal, /origin\.protocol == "https" && origin\.host\.lowercased\(\) == trustedHost && origin\.port == 0/);
  assert.match(portal, /var trustedHost: String \{ account == \.office \? "tbarchitekten\.github\.io" : "gari01234\.github\.io" \}/);
  assert.match(bridge, /\(body\["v"\] as\? Int\) == Self\.version/);
  assert.match(bridge, /"error": "rejected"/);
  for (const type of ["session.get", "session.signIn", "session.signOut", "app.info", "nav.open", "shell.badge", "account.switch"])
    assert.ok(bridge.includes('case "' + type + '"'), type);
  // The page may only ask for the tab sections; the web hides its own nav only for "shell.tabs".
  assert.match(bridge, /\? \["assistant", "feed", "calendar", "work", "tools", "projects", "plans"\]\s*: \["assistant", "feed", "bandeja", "ideas", "work", "calendar"\]/);
  assert.match(bridge, /guard let section = body\["section"\] as\? String, tabSections\.contains\(section\)/);
  // Switching accounts: only to one of the two known accounts.
  assert.match(bridge, /guard let raw = body\["to"\] as\? String, let target = WindowAccount\(rawValue: raw\)/);
  assert.match(bridge, /section == "bandeja", let view = body\["view"\] as\? String, \["confirm", "suggest", "ideas"\]\.contains\(view\)/);
  // The badge is only a small whole number.
  assert.match(bridge, /let count = body\["count"\] as\? Int, \(0\.\.\.999\)\.contains\(count\)/);
  assert.match(bridge, /"nav\.open", "shell\.tabs", "account\.switch"\]/);
  assert.match(bridge, /if !office \{ capabilities\.append\("shell\.badge"\) \}/);
  assert.doesNotMatch(bridge, /refresh|evaluateJavaScript|WKUserScript|service_role/i);
  const doc = read("BRIDGE.md");
  assert.match(doc, /refresh token nunca sale del Llavero/);
});

test("the WebKit portal cannot bridge native authority or load arbitrary top-level sites", () => {
  assert.match(portal, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(portal, /url\.host\?\.lowercased\(\) == trustedHost/);
  assert.match(portal, /if account == \.office \{ return true \}\s*return url\.path == "\/minds" \|\| url\.path\.hasPrefix\("\/minds\/"\)/);
  assert.match(portal, /action\.targetFrame\?\.isMainFrame == false/);
  assert.match(portal, /UIApplication\.shared\.open\(url\)/);
  assert.match(portal, /decisionHandler\(\.cancel\)/);
  // Each account has its own website data: the office never shares Window's cookies or storage.
  assert.match(portal, /configuration\.websiteDataStore = dataStore/);
  assert.match(portal, /account == \.office \? WKWebsiteDataStore\(forIdentifier: Self\.officeDataStoreID\) : \.default\(\)/);
  // The page asks, the app answers: no script injection and no tokens in this file.
  assert.doesNotMatch(portal, /evaluateJavaScript|WKUserScript|service_role|refreshToken|accessToken|Bearer /);
  // Microphone only for MINDS pages; iOS still asks the first time.
  assert.match(portal, /decisionHandler\(trusts\(origin\) \? \.grant : \.deny\)/);
});

test("every permission the web app can ask for has its iOS usage text (otherwise iOS ends the app)", () => {
  for (const key of ["NSMicrophoneUsageDescription","NSSpeechRecognitionUsageDescription","NSCameraUsageDescription",
    "NSPhotoLibraryUsageDescription","NSPhotoLibraryAddUsageDescription","NSLocationWhenInUseUsageDescription"])
    assert.match(project, new RegExp("INFOPLIST_KEY_" + key + ": \\S"));
});


test("native logout purges the embedded owner session, not only Keychain", () => {
  assert.match(app, /await backend\.logout\(\)/);
  assert.match(app, /await webPortal\.clearForLogout\(\)/);
  assert.match(portal, /func clearForLogout\(\) async/);
  assert.match(portal, /WKWebsiteDataStore\.allWebsiteDataTypes\(\)/);
  assert.match(portal, /modifiedSince: \.distantPast/);
  assert.match(portal, /started = false/);
});

test("documentation treats functional parity as an acceptance gate, not completed", () => {
  assert.match(contract, /equivalencia funcional/i);
  assert.match(contract, /no equivale a una aceptación/i);
  assert.match(contract, /Share Extension/);
  assert.match(contract, /APNs/);
  assert.match(contract, /WidgetKit/);
  assert.match(rootDoc, /cliente iOS/i);
});

test("two accounts like GitHub users: the office has its own sign-in, session and web data", () => {
  const office = read("Sources/Services/OfficeSession.swift");
  const plist = read("Config/App-Info.plist");
  // Sign-in with the office's own e-mail and password; only active members with their own password.
  assert.match(office, /request\("auth\/v1\/token", method: "POST",\s*query: \[URLQueryItem\(name: "grant_type", value: "password"\)\]/);
  assert.match(office, /guard let member, member\["is_active"\] as\? Bool == true/);
  assert.match(office, /member\["must_change_password"\] as\? Bool == true/);
  // Its own Keychain item, outside the App Group: the widget, the Share Extension and Siri stay personal.
  assert.match(office, /static let key = "tba\.office\.native\.session"/);
  assert.doesNotMatch(office, /kSecAttrAccessGroup|MINDSAppGroupID/);
  assert.match(office, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  // The page gets the access token only.
  assert.match(office, /return BridgeSession\(accessToken: stored\.accessToken, expiresAt: stored\.expiresAt,/);
  assert.match(plist, /<key>OFFICE_SUPABASE_URL<\/key>\s*<string>https:\/\/ynzsbemisjvfgbqcqliq\.supabase\.co<\/string>/);
  assert.match(plist, /<key>OFFICE_SUPABASE_KEY<\/key>\s*<string>sb_publishable_/);
  assert.doesNotMatch(plist + office, /service_role|sb_secret_/);
  // The model: two portals, the account persisted, switching resets to Chat.
  assert.match(app, /let officePortal = MINDSWebPortalSession\(account: \.office\)/);
  assert.match(app, /officePortal\.sessionProvider = \{ \[office\] in try await office\.bridgeSession\(\) \}/);
  assert.match(app, /UserDefaults\.standard\.set\(target\.rawValue, forKey: Self\.accountKey\)/);
  assert.match(app, /await officePortal\.clearForLogout\(\)/);
  assert.match(shell, /OfficeSignInView\(\)/);
  assert.match(shell, /Button\("Entrar a Office"\) \{ model\.switchAccount\(to: \.office\) \}/);
  assert.match(shell, /Button\("Zu Persönlich wechseln"\) \{ model\.switchAccount\(to: \.personal\) \}/);
  assert.match(tabs, /\.id\(model\.account\)/);
  // Window's web menu offers the office only inside the app.
  const web = readFileSync(new URL("../apps/isabella/shell.js", import.meta.url), "utf8");
  assert.match(web, /<button id="switchToOffice" type="button" class="hidden">Cambiar a Office<\/button>/);
  assert.match(web, /includes\('account\.switch'\)/);
  assert.match(web, /native\.call\('account\.switch',\{to:'office'\}\)/);
});
