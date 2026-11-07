import WebKit

// Typed bridge between the MINDS web app and the native app (contract v1, see BRIDGE.md).
// Only the top-level page of the portal's own account may call it: MINDS for Persönlich,
// TBA Office for Office. The web app receives the current access token of that account;
// the long-lived sign-in token never leaves the native Keychain.
@MainActor
final class WindowNativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "windowNative"
    static let version = 1
    weak var portal: MINDSWebPortalSession?

    func isTrusted(_ frame: WKFrameInfo) -> Bool {
        guard let portal else { return false }
        return frame.isMainFrame && portal.trusts(frame.securityOrigin)
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard isTrusted(message.frameInfo),
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
            let tabSections = portal?.account == .office
                ? ["assistant", "feed", "calendar", "work", "tools", "projects", "plans"]
                : ["assistant", "feed", "bandeja", "ideas", "work", "calendar"]
            guard let section = body["section"] as? String, tabSections.contains(section) else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            var extra: [String: String] = [:]
            if section == "bandeja", let view = body["view"] as? String, ["confirm", "suggest", "ideas"].contains(view) {
                extra["view"] = view
            }
            portal?.onNavigate?(section, extra)
            return ["v": v, "ok": true]
        case "account.switch":
            // Like changing users on GitHub: the app shows the other account (its own sign-in if needed).
            guard let raw = body["to"] as? String, let target = WindowAccount(rawValue: raw) else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            portal?.onSwitchAccount?(target)
            return ["v": v, "ok": true]
        case "calendar.other":
            // Two calendars in both accounts: the other account's events, read with its own session.
            // Days as YYYY-MM-DD, at most 120 of them; only id, title and times are returned.
            let isDay: (String) -> Bool = { text in
                text.count == 10 && text.enumerated().allSatisfy { index, char in
                    index == 4 || index == 7 ? char == "-" : char.isASCII && char.isNumber
                }
            }
            guard let from = body["from"] as? String, let to = body["to"] as? String,
                  isDay(from), isDay(to),
                  let provider = portal?.otherCalendar else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            let other = portal?.account == .office ? "personal" : "office"
            do {
                guard let events = try await provider(from, to) else {
                    return ["v": v, "ok": true, "account": other, "signedIn": false, "events": [Any]()]
                }
                return ["v": v, "ok": true, "account": other, "signedIn": true, "events": events]
            } catch {
                return ["v": v, "ok": false, "error": "unavailable"]
            }
        case "shell.badge":
            // «Por confirmar» in the Bandeja, as the page counted it: only a small whole number.
            guard let count = body["count"] as? Int, (0...999).contains(count) else {
                return ["v": v, "ok": false, "error": "unsupported"]
            }
            portal?.onBadge?(count)
            return ["v": v, "ok": true]
        case "app.info":
            let info = Bundle.main.infoDictionary ?? [:]
            let office = portal?.account == .office
            var capabilities = ["session.get", "session.signIn", "session.signOut", "app.info", "nav.open", "shell.tabs", "account.switch", "calendar.other"]
            if !office { capabilities.append("shell.badge") }
            return ["v": v, "ok": true, "app": [
                "name": "Window",
                "version": info["CFBundleShortVersionString"] as? String ?? "",
                "build": info["CFBundleVersion"] as? String ?? "",
                "account": office ? "office" : "personal",
                "capabilities": capabilities
            ] as [String: Any]]
        default:
            return ["v": v, "ok": false, "error": "unsupported"]
        }
    }
}
