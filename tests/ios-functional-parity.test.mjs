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

test("Window on iPhone is the hosted MINDS web app, full screen, with one sign-in", () => {
  assert.match(shell, /FullMINDSView\(\)/);
  // No second navigation (native tab bar or "MINDS completo" bar) and no separate native sign-in.
  assert.doesNotMatch(shell, /TabView|NativeSignInView|NavigationStack|bootstrap\(\)/);
  for (const view of ["ContinuityView","ChatView","CalendarHomeView"])
    assert.doesNotMatch(shell, new RegExp(view + "\\(\\)"));
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
  assert.match(app, /enum Section: Hashable \{ case web, continuity, chat, calendar \}/);
  assert.match(app, /var section: Section = \.web/);
  assert.match(portal, /https:\/\/gari01234\.github\.io\/minds\/isabella\//);
  assert.match(portal, /UIViewRepresentable/);
  assert.match(project, /- Sources/);
});

test("the WebKit portal cannot bridge native authority or load arbitrary top-level sites", () => {
  assert.match(portal, /url\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(portal, /url\.host\?\.lowercased\(\) == "gari01234\.github\.io"/);
  assert.match(portal, /url\.path\.hasPrefix\("\/minds\/"\)/);
  assert.match(portal, /action\.targetFrame\?\.isMainFrame == false/);
  assert.match(portal, /UIApplication\.shared\.open\(url\)/);
  assert.match(portal, /decisionHandler\(\.cancel\)/);
  assert.match(portal, /websiteDataStore = \.default\(\)/);
  assert.doesNotMatch(portal, /evaluateJavaScript|WKUserScript|service_role|refreshToken|accessToken|Bearer /);
  // Microphone only for MINDS pages; iOS still asks the first time.
  assert.match(portal, /origin\.protocol == "https" && origin\.host\.lowercased\(\) == "gari01234\.github\.io" \? \.grant : \.deny/);
});

test("every permission the web app can ask for has its iOS usage text (otherwise iOS ends the app)", () => {
  for (const key of ["NSMicrophoneUsageDescription","NSSpeechRecognitionUsageDescription","NSCameraUsageDescription",
    "NSPhotoLibraryUsageDescription","NSPhotoLibraryAddUsageDescription","NSLocationWhenInUseUsageDescription"])
    assert.match(project, new RegExp("INFOPLIST_KEY_" + key + ": \\S"));
});

test("inside the Window app the web app offers sign-in right away", () => {
  const sync = readFileSync(new URL("../apps/isabella/sync.js", import.meta.url), "utf8");
  assert.match(sync, /else if\(\/WindowApp\\\/\/\.test\(navigator\.userAgent\|\|''\)\)openLogin\(\);/);
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
