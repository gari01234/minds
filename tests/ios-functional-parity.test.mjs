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
  const labels = [...tabs.matchAll(/Label\("([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(labels, ["Chat", "Ahora", "Tiempo", "Work", "Bandeja"]);
  assert.match(app, /var tab: Tab = \.chat/);
  assert.equal((tabs.match(/WebTabView\(session: model\.webPortal, active: model\.tab == \.(chat|tiempo|work)\)/g) || []).length, 3);
  assert.match(tabs, /\.badge\(model\.openProposals\)/);
  assert.match(tabs, /\.onChange\(of: model\.tab\) \{ _, _ in model\.showWebSection\(\) \}/);
  // Above the tab bar: build 14 drew the page under it and hid the chat composer.
  assert.equal((tabs.match(/\.ignoresSafeArea\(edges: \.top\)/g) || []).length, 3);
  assert.doesNotMatch(tabs, /\.ignoresSafeArea\(\)/);
  // One shared web view: the active tab takes it over (a UIView has one parent).
  assert.match(portal, /struct WebTabView: UIViewRepresentable/);
  assert.match(portal, /if web\.superview !== container \{\s*web\.removeFromSuperview\(\)/);
  assert.doesNotMatch(portal, /NavigationStack|MINDS completo|navigationTitle/);
  assert.match(portal, /contentInsetAdjustmentBehavior = \.never/);
  assert.match(portal, /applicationNameForUserAgent = "WindowApp\/1\.0"/);
  assert.match(portal, /func webViewWebContentProcessDidTerminate/);
  // The app picks the section by URL fragment: whitelisted, "+" encoded, no reload.
  assert.match(portal, /static func sectionURL\(_ section: String, extra: \[String: String\] = \[:\]\) -> URL\?/);
  assert.match(portal, /\["assistant", "feed", "ideas", "work", "calendar", "readings", "thoughts"\]\.contains\(section\)/);
  assert.match(portal, /replacingOccurrences\(of: "\+", with: "%2B"\)/);
  // Made when the page is first shown, never at launch: AppModel exists before
  // UIApplicationMain, and a web view made then crashes UIKit on the first touch.
  assert.match(portal, /private var made: WKWebView\?/);
  assert.match(portal, /var webView: WKWebView \{\s*if let made \{ return made \}/);
  assert.doesNotMatch(portal, /let webView: WKWebView|override init\(\)/);
  assert.match(app, /webPortal\.sessionProvider = \{ \[backend\] in try await backend\.bridgeSession\(\) \}/);
  assert.match(app, /webPortal\.onNavigate = \{ \[weak self\] section in self\?\.open\(section: section\) \}/);
  assert.match(app, /webPortal\.reloadIfStarted\(\)/);
});

test("the typed bridge answers only the top-level MINDS page and never carries the refresh token", () => {
  assert.match(portal, /addScriptMessageHandler\(\s*bridge, contentWorld: \.page, name: WindowNativeBridge\.name\)/);
  assert.match(bridge, /static let name = "windowNative"/);
  assert.match(bridge, /static let version = 1/);
  assert.match(bridge, /frame\.isMainFrame/);
  assert.match(bridge, /origin\.protocol == "https"/);
  assert.match(bridge, /origin\.host\.lowercased\(\) == "gari01234\.github\.io"/);
  assert.match(bridge, /origin\.port == 0/);
  assert.match(bridge, /\(body\["v"\] as\? Int\) == Self\.version/);
  assert.match(bridge, /"error": "rejected"/);
  for (const type of ["session.get", "session.signIn", "session.signOut", "app.info", "nav.open"])
    assert.ok(bridge.includes('case "' + type + '"'), type);
  // The page may only ask for the tab sections; the web hides its own nav only for "shell.tabs".
  assert.match(bridge, /\["assistant", "feed", "ideas", "work", "calendar"\]\.contains\(section\)/);
  assert.match(bridge, /"nav\.open", "shell\.tabs"\]/);
  assert.doesNotMatch(bridge, /refresh|evaluateJavaScript|WKUserScript|service_role/i);
  const doc = read("BRIDGE.md");
  assert.match(doc, /refresh token nunca sale del Llavero/);
});

test("the WebKit portal cannot bridge native authority or load arbitrary top-level sites", () => {
  assert.match(portal, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(portal, /url\.host\?\.lowercased\(\) == "gari01234\.github\.io"/);
  assert.match(portal, /url\.path\.hasPrefix\("\/minds\/"\)/);
  assert.match(portal, /action\.targetFrame\?\.isMainFrame == false/);
  assert.match(portal, /UIApplication\.shared\.open\(url\)/);
  assert.match(portal, /decisionHandler\(\.cancel\)/);
  assert.match(portal, /websiteDataStore = \.default\(\)/);
  // The page asks, the app answers: no script injection and no tokens in this file.
  assert.doesNotMatch(portal, /evaluateJavaScript|WKUserScript|service_role|refreshToken|accessToken|Bearer /);
  // Microphone only for MINDS pages; iOS still asks the first time.
  assert.match(portal, /origin\.protocol == "https" && origin\.host\.lowercased\(\) == "gari01234\.github\.io" \? \.grant : \.deny/);
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
