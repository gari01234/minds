import WebKit

// Typed bridge between the MINDS web app and the native app (contract v1, see BRIDGE.md).
// Only the top-level MINDS page may call it. The web app receives the current
// access token; the long-lived sign-in token never leaves the native Keychain.
@MainActor
final class WindowNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "windowNative"
    static let version = 1
    weak var portal: MINDSWebPortalSession?

    static func isTrusted(_ frame: WKFrameInfo) -> Bool {
        let origin = frame.securityOrigin
        return frame.isMainFrame
            && origin.protocol == "https"
            && origin.host.lowercased() == "gari01234.github.io"
            && origin.port == 0
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard Self.isTrusted(message.frameInfo),
              let body = message.body as? [String: Any],
              (body["v"] as? Int) == Self.version,
              let type = body["type"] as? String else {
            replyHandler(["v": Self.version, "ok": false, "error": "rejected"], nil)
            return
        }
        Task { @MainActor in
            let reply = await self.handle(type, body)
            replyHandler(reply, nil)
        }
    }

    private func handle(_ type: String, _ body: [String: Any]) async -> [String: Any] {
        let v = Self.version
        switch type {
        case "session.get":
            guard let provider = portal?.sessionProvider else {
                return ["v": v, "ok": true, "session": NSNull()]
            }
            do {
                guard let session = try await provider() else {
                    return ["v": v, "ok": true, "session": NSNull()]
                }
                return ["v": v, "ok": true, "session": [
                    "access_token": session.accessToken,
                    "expires_at": Int(session.expiresAt),
                    "user": ["id": session.userID, "email": session.email.map { $0 as Any } ?? NSNull()] as [String: Any]
                ] as [String: Any]]
            } catch BackendError.notSignedIn {
                portal?.onSessionLost?()
                return ["v": v, "ok": true, "session": NSNull()]
            } catch {
                return ["v": v, "ok": false, "error": "unavailable"]
            }
        case "session.signIn":
            portal?.onSessionLost?()
            return ["v": v, "ok": true]
        case "session.signOut":
            await portal?.onSignOut?()
            return ["v": v, "ok": true]
        case "nav.open":
            // The page asks for a section that belongs to another tab.
            guard let section = body["section"] as? String,
                  ["assistant", "feed", "bandeja", "ideas", "work", "calendar"].contains(section) else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            var extra: [String: String] = [:]
            if section == "bandeja", let view = body["view"] as? String, ["confirm", "suggest", "ideas"].contains(view) {
                extra["view"] = view
            }
            portal?.onNavigate?(section, extra)
            return ["v": v, "ok": true]
        case "shell.badge":
            // «Por confirmar» in the Bandeja, as the page counted it: only a small whole number.
            guard let count = body["count"] as? Int, (0...999).contains(count) else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            portal?.onBadge?(count)
            return ["v": v, "ok": true]
        case "app.info":
            let info = Bundle.main.infoDictionary ?? [:]
            return ["v": v, "ok": true, "app": [
                "name": "Window",
                "version": info["CFBundleShortVersionString"] as? String ?? "",
                "build": info["CFBundleVersion"] as? String ?? "",
                "capabilities": ["session.get", "session.signIn", "session.signOut", "app.info", "nav.open", "shell.tabs", "shell.badge"]
            ] as [String: Any]]
        default:
            return ["v": v, "ok": false, "error": "unsupported"]
        }
    }
}
