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
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
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
    @State private var showSessionInformation = false

    var body: some View {
        NavigationStack {
            MINDSWebContainer(session: model.webPortal)
                .background(Color(uiColor: .systemBackground))
                .navigationTitle("MINDS completo")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Información de la sesión", systemImage: "info.circle") {
                            showSessionInformation = true
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Recargar MINDS", systemImage: "arrow.clockwise") {
                            model.webPortal.refresh()
                        }
                    }
                }
                .alert("Acceso a MINDS web", isPresented: $showSessionInformation) {
                    Button("Entendido", role: .cancel) {}
                } message: {
                    Text("La sesión web es independiente de la sesión nativa. Inicia sesión con la misma cuenta MINDS. No se transfieren contraseñas ni tokens del llavero a la página.")
                }
        }
    }
}
