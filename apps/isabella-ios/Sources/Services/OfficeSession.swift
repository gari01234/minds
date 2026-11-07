import Foundation
import Security

// The two accounts of Window, like switching users on GitHub: each one has its own sign-in,
// its own session and its own data. Persönlich is Window (MINDS); Office is TBA Office, a
// separate Supabase project. Nothing is copied between them. The widget, the Share Extension
// and Siri stay with the personal account.
enum WindowAccount: String {
    case personal, office
}

// TBA Office: the public address and publishable key (RLS and the JWT govern access),
// from Config/App-Info.plist.
enum OfficeConfig {
    static var url: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "OFFICE_SUPABASE_URL") as? String,
              let url = URL(string: value), url.scheme == "https" else { return nil }
        return url
    }
    static var publishableKey: String {
        Bundle.main.object(forInfoDictionaryKey: "OFFICE_SUPABASE_KEY") as? String ?? ""
    }
}

private struct OfficeStoredSession: Codable {
    var accessToken: String
    var refreshToken: String
    var userID: String
    var expiresAt: TimeInterval
    var email: String?
}

// The office session lives in the app's own Keychain (not in the App Group: the extensions
// never use it). Readable after the first unlock, on this device only.
private enum OfficeKeychain {
    static let key = "tba.office.native.session"
    static var selector: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: key,
         kSecAttrAccount as String: key]
    }
    static func load() -> OfficeStoredSession? {
        var query = selector
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(OfficeStoredSession.self, from: data)
    }
    static func save(_ session: OfficeStoredSession) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(selector as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var new = selector
            attributes.forEach { new[$0.key] = $0.value }
            guard SecItemAdd(new as CFDictionary, nil) == errSecSuccess else {
                throw BackendError.rejected("Die Office-Anmeldung konnte nicht gespeichert werden.")
            }
        } else if status != errSecSuccess {
            throw BackendError.rejected("Die Office-Anmeldung konnte nicht gespeichert werden.")
        }
    }
    static func clear() {
        SecItemDelete(selector as CFDictionary)
    }
}

// Sign-in to TBA Office with e-mail and password (the office's own accounts), like the office
// start page. The app is the only owner of the refresh token; the office web page borrows the
// access token through the bridge, exactly as Window's page does for the personal account.
actor OfficeSession {
    private var session: OfficeStoredSession? = OfficeKeychain.load()
    private var refreshing: Task<OfficeStoredSession, Error>?

    var isSignedIn: Bool {
        if session == nil { session = OfficeKeychain.load() }
        return session != nil
    }

    var email: String? { session?.email }

    private func request(_ path: String, method: String = "GET", query: [URLQueryItem] = [],
                         json: [String: Any]? = nil, token: String? = nil) async throws -> Data {
        let key = OfficeConfig.publishableKey
        guard let root = OfficeConfig.url, !key.isEmpty,
              var components = URLComponents(url: root.appending(path: path), resolvingAgainstBaseURL: false)
        else { throw BackendError.rejected("Office ist in dieser App nicht eingerichtet.") }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw BackendError.invalidResponse }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(key, forHTTPHeaderField: "apikey")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        req.timeoutInterval = 60
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw BackendError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            let code = (body["error_code"] as? String ?? body["error"] as? String ?? "").lowercased()
            let detail = (body["error_description"] as? String ?? body["msg"] as? String ?? "").lowercased()
            if code.contains("invalid_credentials") || code.contains("invalid_grant") && detail.contains("credentials") {
                throw BackendError.rejected("E-Mail oder Passwort stimmt nicht.")
            }
            if detail.contains("refresh token") || code.contains("refresh_token") {
                throw BackendError.notSignedIn
            }
            throw BackendError.rejected("Office antwortet gerade nicht (HTTP \(http.statusCode)).")
        }
        return data
    }

    private func parse(_ data: Data) throws -> OfficeStoredSession {
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = obj["access_token"] as? String, !access.isEmpty,
              let refresh = obj["refresh_token"] as? String, !refresh.isEmpty,
              let user = obj["user"] as? [String: Any],
              let id = user["id"] as? String, UUID(uuidString: id) != nil,
              let expiry = obj["expires_in"] as? Int, expiry > 0 else {
            throw BackendError.invalidResponse
        }
        return OfficeStoredSession(accessToken: access, refreshToken: refresh, userID: id,
                                   expiresAt: Date().timeIntervalSince1970 + Double(expiry),
                                   email: user["email"] as? String)
    }

    func signIn(email: String, password: String) async throws {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard cleanEmail.contains("@"), cleanEmail.count < 255, !password.isEmpty else {
            throw BackendError.rejected("Bitte E-Mail und Passwort eingeben.")
        }
        let data = try await request("auth/v1/token", method: "POST",
                                     query: [URLQueryItem(name: "grant_type", value: "password")],
                                     json: ["email": cleanEmail, "password": password])
        let fresh = try parse(data)
        // Only active office members with their own password, like the office start page.
        let rows = try await request("rest/v1/office_members",
            query: [URLQueryItem(name: "select", value: "is_active,must_change_password"),
                    URLQueryItem(name: "user_id", value: "eq." + fresh.userID)],
            token: fresh.accessToken)
        let member = (try? JSONSerialization.jsonObject(with: rows) as? [[String: Any]])?.first
        guard let member, member["is_active"] as? Bool == true else {
            _ = try? await request("auth/v1/logout", method: "POST", token: fresh.accessToken)
            throw BackendError.rejected("Kein aktiver Office-Zugang.")
        }
        if member["must_change_password"] as? Bool == true {
            _ = try? await request("auth/v1/logout", method: "POST", token: fresh.accessToken)
            throw BackendError.rejected("Bitte zuerst im Browser auf tbarchitekten.github.io das Startpasswort ändern.")
        }
        try OfficeKeychain.save(fresh)
        session = fresh
    }

    // One refresh at a time: Supabase rotates refresh tokens.
    private func valid() async throws -> OfficeStoredSession {
        if let refreshing { return try await refreshing.value }
        guard let stored = session ?? OfficeKeychain.load() else { throw BackendError.notSignedIn }
        session = stored
        if stored.expiresAt >= Date().timeIntervalSince1970 + 90 { return stored }
        let task = Task { () throws -> OfficeStoredSession in
            let data: Data
            do {
                data = try await request("auth/v1/token", method: "POST",
                    query: [URLQueryItem(name: "grant_type", value: "refresh_token")],
                    json: ["refresh_token": stored.refreshToken])
            } catch BackendError.notSignedIn {
                OfficeKeychain.clear()
                session = nil
                throw BackendError.notSignedIn
            }
            var fresh = try parse(data)
            if fresh.email == nil { fresh.email = stored.email }
            try OfficeKeychain.save(fresh)
            return fresh
        }
        refreshing = task
        defer { refreshing = nil }
        let fresh = try await task.value
        session = fresh
        return fresh
    }

    // For the office web page, through the bridge: never the refresh token.
    func bridgeSession() async throws -> BridgeSession? {
        guard isSignedIn else { return nil }
        let stored = try await valid()
        return BridgeSession(accessToken: stored.accessToken, expiresAt: stored.expiresAt,
                             userID: stored.userID, email: stored.email)
    }

    func logout() async {
        let token = session?.accessToken
        session = nil
        OfficeKeychain.clear()
        if let token { _ = try? await request("auth/v1/logout", method: "POST", token: token) }
    }
}
