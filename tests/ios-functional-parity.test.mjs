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

test("Window on iPhone: the app owns the session and shows the MINDS web app full screen", () => {
  assert.match(shell, /FullMINDSView\(\)/);
  assert.match(shell, /NativeSignInView\(\)/);
  assert.match(shell, /model\.bootstrap\(\)/);
  // No native tab bar until its design is approved, and no "MINDS completo" bar.
  assert.doesNotMatch(shell, /TabView|NavigationStack/);
  for (const view of ["ContinuityView","ChatView","CalendarHomeView"])
    assert.doesNotMatch(shell, new RegExp(view + "\\(\\)"));
  // The UI-test shortcut exists only in Debug builds.
  assert.match(shell, /#if DEBUG\s+\/\/[^\n]*\n\s+static let webOnlyForUITests = ProcessInfo\.processInfo\.arguments\.contains\("-WindowUITestWebOnly"\)\s+#else\s+static let webOnlyForUITests = false/);
  assert.doesNotMatch(portal, /NavigationStack|MINDS completo|navigationTitle/);
  assert.match(portal, /\.ignoresSafeArea\(\)/);
  assert.match(portal, /contentInsetAdjustmentBehavior = \.never/);
  assert.match(portal, /applicationNameForUserAgent = "WindowApp\/1\.0"/);
  assert.match(portal, /func webViewWebContentProcessDidTerminate/);
  // Made when the page is first shown, never at launch: AppModel exists before
  // UIApplicationMain, and a web view made then crashes UIKit on the first touch.
  assert.match(portal, /private var made: WKWebView\?/);
  assert.match(portal, /var webView: WKWebView \{\s*if let made \{ return made \}/);
  assert.doesNotMatch(portal, /let webView: WKWebView|override init\(\)/);
  assert.match(app, /webPortal\.sessionProvider = \{ \[backend\] in try await backend\.bridgeSession\(\) \}/);
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
  for (const type of ["session.get", "session.signIn", "session.signOut", "app.info"])
    assert.ok(bridge.includes('case "' + type + '"'), type);
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
