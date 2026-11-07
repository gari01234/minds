import SwiftUI
import WebKit
import UIKit

// Bridge to the already deployed MINDS web application. It has no access to
// Keychain, privileged credentials, native task mutations or Apple approvals.
// One session per account: Persönlich shows Window (MINDS), Office shows TBA Office.
// Each has its own web view and its own website data (cookies, local storage).
@MainActor
final class MINDSWebPortalSession: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let homeURL = URL(string: "https://gari01234.github.io/minds/isabella/")!
    static let officeHomeURL = URL(string: "https://tbarchitekten.github.io/app/")!
    // A fixed identifier: the office's website data survives app launches, apart from Window's.
    private static let officeDataStoreID = UUID(uuidString: "6F1C2A4E-0B7D-4C3A-9E51-7A0D2B3C4F10")!

    let account: WindowAccount
    private var made: WKWebView?
    private var started = false

    init(account: WindowAccount = .personal) {
        self.account = account
        super.init()
    }

    var startURL: URL { account == .office ? Self.officeHomeURL : Self.homeURL }
    var trustedHost: String { account == .office ? "tbarchitekten.github.io" : "gari01234.github.io" }
    // Sections the app may open in this account (the fragment #section=…).
    var sections: [String] {
        account == .office
            ? ["assistant", "feed", "calendar", "work", "tools", "projects", "plans"]
            : ["assistant", "feed", "bandeja", "ideas", "work", "calendar", "readings", "thoughts"]
    }
    private var dataStore: WKWebsiteDataStore {
        account == .office ? WKWebsiteDataStore(forIdentifier: Self.officeDataStoreID) : .default()
    }

    // The top-level page of this account's site, over https on the default port.
    func trusts(_ origin: WKSecurityOrigin) -> Bool {
        origin.protocol == "https" && origin.host.lowercased() == trustedHost && origin.port == 0
    }

    // Set by AppModel: the app owns the session; the bridge only asks for it.
    var sessionProvider: (() async throws -> BridgeSession?)?
    var onSignOut: (() async -> Void)?
    var onSessionLost: (() -> Void)?
    var onNavigate: ((String, [String: String]) -> Void)?
    var onBadge: ((Int) -> Void)?
    var onSwitchAccount: ((WindowAccount) -> Void)?
    // The other account's events for this page's calendar (read-only); nil when that account is signed out.
    var otherCalendar: ((String, String) async throws -> [[String: Any]]?)?

    // The web view is made the first time the page is shown, never at launch.
    // AppModel (and this session) are created before UIApplicationMain; a web
    // view made then keeps gesture recognizers UIKit never registered, and the
    // first touch aborts the app in -[UIGestureRecognizer _delayTouch:forEvent:]
    // (TestFlight build 9, iOS 27).
    var webView: WKWebView {
        if let made { return made }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = dataStore
        // Marks requests from the app; the web app detects app mode by the bridge.
        configuration.applicationNameForUserAgent = "WindowApp/1.0"
        configuration.allowsInlineMediaPlayback = true
        let bridge = WindowNativeBridge()
        bridge.portal = self
        configuration.userContentController.addScriptMessageHandler(
            bridge, contentWorld: .page, name: WindowNativeBridge.name)
        let view = WKWebView(frame: .zero, configuration: configuration)
        // The page draws under the status bar and home indicator itself
        // (viewport-fit=cover + env(safe-area-inset-*)), exactly as in Safari.
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        view.scrollView.backgroundColor = .systemBackground
        view.navigationDelegate = self
        view.uiDelegate = self
        made = view
        return view
    }

    // Microphone for talking to Isabella: only MINDS pages may ask, and iOS still
    // shows its own permission prompt the first time.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(trusts(origin) ? .grant : .deny)
    }

    // If the page's process is ended by iOS (memory), reload instead of staying blank.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Self.trace("web process ended, reloading")
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Self.trace("loaded " + (webView.url?.absoluteString ?? "?"))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Self.trace("failed: " + error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        Self.trace("could not load: " + error.localizedDescription)
    }

    // Debug builds only (the simulator smoke test reads these lines from the system log).
    private static func trace(_ message: String) {
        #if DEBUG
        NSLog("WINDOW-WEB %@", message)
        #endif
    }

    func openIfNeeded() {
        guard !started else { return }
        show(section: "assistant")
    }

    // The app chooses the page's section through the URL fragment (#section=…).
    // A fragment-only change is a same-document navigation: the page is not reloaded.
    func show(section: String, extra: [String: String] = [:]) {
        guard sections.contains(section),
              let url = Self.sectionURL(section, extra: extra, home: startURL, allowed: sections) else { return }
        if !started {
            started = true
            Self.trace("opening " + url.absoluteString)
            webView.load(URLRequest(url: url))
            return
        }
        guard webView.url?.absoluteString != url.absoluteString else { return }
        webView.load(URLRequest(url: url))
    }

    static func sectionURL(_ section: String, extra: [String: String] = [:], home: URL = MINDSWebPortalSession.homeURL,
                           allowed: [String] = ["assistant", "feed", "bandeja", "ideas", "work", "calendar", "readings", "thoughts"]) -> URL? {
        guard allowed.contains(section),
              var components = URLComponents(url: home, resolvingAgainstBaseURL: false) else { return nil }
        var fragment = URLComponents()
        fragment.queryItems = [URLQueryItem(name: "section", value: section)]
            + extra.keys.sorted().map { URLQueryItem(name: $0, value: extra[$0]) }
        // URLSearchParams reads "+" as a space: encode it.
        components.percentEncodedFragment = fragment.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return components.url
    }

    func refresh() {
        openIfNeeded()
        webView.reload()
    }

    // After signing in again, the page must ask the bridge for the new session.
    func reloadIfStarted() {
        guard started else { return }
        made?.reload()
    }

    // Same-origin MINDS and Theory are trusted pages. A link elsewhere opens
    // outside the embedded session; subframes keep their ordinary web policy.
    // In the office account the whole office site is trusted (app, start page, Terminplan).
    private func isMINDSPage(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == trustedHost,
              url.port == nil else { return false }
        if account == .office { return true }
        return url.path == "/minds" || url.path.hasPrefix("/minds/")
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isMINDSPage(url) {
            decisionHandler(.allow)
        } else {
            if ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    // target=_blank must not create an ungoverned second WKWebView.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if isMINDSPage(url) {
            webView.load(URLRequest(url: url))
        } else if ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func clearForLogout() async {
        made?.stopLoading()
        made?.loadHTMLString("", baseURL: nil)
        // This data store belongs to the embedded browser of this account, not Safari
        // and not the other account. Purge cookies, local storage and cached credentials.
        let store = made?.configuration.websiteDataStore ?? dataStore
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            store.removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: .distantPast
            ) { continuation.resume() }
        }
        started = false
    }
}

// Hosts the one shared web view in whichever tab is showing it. A UIView has a
// single parent, so the active tab takes it over; the page keeps its state.
struct WebTabView: UIViewRepresentable {
    let session: MINDSWebPortalSession
    let active: Bool

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = .systemBackground
        return container
    }

    func updateUIView(_ container: UIView, context: Context) {
        guard active else { return }
        let web = session.webView
        if web.superview !== container {
            web.removeFromSuperview()
            web.frame = container.bounds
            web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(web)
        }
        session.openIfNeeded()
    }
}
