import SwiftUI
import WebKit
import UIKit

// Bridge to the already deployed MINDS web application. It has no access to
// Keychain, privileged credentials, native task mutations or Apple approvals.
@MainActor
final class MINDSWebPortalSession: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let homeURL = URL(string: "https://gari01234.github.io/minds/isabella/")!
    let webView: WKWebView
    private var started = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // Lets the web app know it runs inside Window (e.g. to offer sign-in right away).
        configuration.applicationNameForUserAgent = "WindowApp/1.0"
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        // The page draws under the status bar and home indicator itself
        // (viewport-fit=cover + env(safe-area-inset-*)), exactly as in Safari.
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        view.scrollView.backgroundColor = .systemBackground
        webView = view
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    // Microphone for talking to Isabella: only MINDS pages may ask, and iOS still
    // shows its own permission prompt the first time.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == "https" && origin.host.lowercased() == "gari01234.github.io" ? .grant : .deny)
    }

    // If the page's process is ended by iOS (memory), reload instead of staying blank.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func openIfNeeded() {
        guard !started else { return }
        started = true
        webView.load(URLRequest(url: Self.homeURL))
    }

    func refresh() {
        openIfNeeded()
        webView.reload()
    }

    // Same-origin MINDS and Theory are trusted pages. A link elsewhere opens
    // outside the embedded session; subframes keep their ordinary web policy.
    private static func isMINDSPage(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.host?.lowercased() == "gari01234.github.io",
              url.port == nil else { return false }
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
        if Self.isMINDSPage(url) {
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
        if Self.isMINDSPage(url) {
            webView.load(URLRequest(url: url))
        } else if ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func clearForLogout() async {
        webView.stopLoading()
        webView.loadHTMLString("", baseURL: nil)
        // This data store belongs to the embedded MINDS browser, not Safari.
        // Purge cookies, local storage and cached credentials upon native logout.
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            WKWebsiteDataStore.default().removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: .distantPast
            ) { continuation.resume() }
        }
        started = false
    }
}

private struct MINDSWebContainer: UIViewRepresentable {
    let session: MINDSWebPortalSession

    func makeUIView(context: Context) -> WKWebView {
        session.openIfNeeded()
        return session.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct FullMINDSView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        MINDSWebContainer(session: model.webPortal)
            .background(Color(uiColor: .systemBackground))
            .ignoresSafeArea()
    }
}
