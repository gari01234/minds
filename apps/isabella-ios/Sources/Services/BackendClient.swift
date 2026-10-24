import Foundation
import Security

enum BackendError: LocalizedError {
    case notConfigured, notSignedIn, invalidResponse, verificationFailed, reviewUnavailable
    case rejected(String)
    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Falta configurar MINDS."
        case .notSignedIn: return "Conecta primero tu cuenta de MINDS."
        case .invalidResponse: return "La respuesta del servidor no pudo verificarse."
        case .verificationFailed: return "Supabase no confirmó el resultado. No se marcará como realizado."
        case .reviewUnavailable: return "Esta propuesta requiere revisión en MINDS web. No se aplicó ningún cambio."
        case .rejected(let message): return message
        }
    }
}

private struct StoredSession: Codable {
    var accessToken: String
    var refreshToken: String
    var userID: String
    var expiresAt: TimeInterval
}

private enum NativeKeychain {
    static let key = "minds.isabella.native.owner.session"
    static var selector: [String: Any] { [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: key,
        kSecAttrAccount as String: key
    ] }
    static func load() -> StoredSession? {
        var query = selector
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }
    static func save(_ session: StoredSession) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(selector as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var new = selector
            attributes.forEach { new[$0.key] = $0.value }
            guard SecItemAdd(new as CFDictionary, nil) == errSecSuccess else {
                throw BackendError.verificationFailed
            }
        } else if status != errSecSuccess {
            throw BackendError.verificationFailed
        }
    }
    static func clear() { SecItemDelete(selector as CFDictionary) }
}

struct AgendaTask: Identifiable, Decodable {
    let id: UUID
    let title: String
    let dueDate: String?
    let completedAt: String?
    let notes: String?
    enum CodingKeys: String, CodingKey {
        case id, title, notes
        case dueDate = "due_date"
        case completedAt = "completed_at"
    }
}

struct NativeReviewProposal: Identifiable {
    let id: String
    let action: String
    let kind: String
    let title: String
    let date: String?
    let candidate: [String: Any]
    init?(json: [String: Any]) {
        guard let request = json["request_id"] as? String,
              UUID(uuidString: request) != nil else { return nil }
        id = request
        action = json["action"] as? String ?? ""
        kind = json["kind"] as? String ?? ""
        title = json["title"] as? String ?? json["target_title"] as? String ?? "Propuesta de Isabella"
        date = json["date"] as? String
        candidate = json
    }
    // Every potentially actionable field must be understood and presented.
    // Unknown/complex proposals remain reviewable in the existing web UI only.
    private static let knownFields: Set<String> = [
        "request_id", "kind", "action", "target_id", "target_title", "target_date",
        "target_time", "title", "date", "time", "all_day", "clear_date",
        "duration_minutes", "category", "project", "notes", "reminder_time",
        "recurrence", "temporal_grounding"
    ]

    var reviewable: Bool {
        guard kind == "task", ["create", "update"].contains(action),
              Set(candidate.keys).isSubset(of: Self.knownFields) else { return false }
        // A recurrence is more than a single date: present it in the advanced web review.
        if let recurrence = candidate["recurrence"] as? [String: Any],
           !recurrence.isEmpty { return false }
        if let recurrence = candidate["recurrence"] as? [Any],
           !recurrence.isEmpty { return false }
        if action == "create" {
            return !(Self.readable(candidate["title"]) ?? "").isEmpty
        }
        return !(Self.readable(candidate["target_id"])
            ?? Self.readable(candidate["target_title"]) ?? "").isEmpty
    }

    struct ReviewDetail: Identifiable {
        let id: String
        let label: String
        let value: String
    }

    private static func readable(_ raw: Any?) -> String? {
        guard let raw, !(raw is NSNull) else { return nil }
        if let text = raw as? String { return text.isEmpty ? nil : text }
        if let number = raw as? NSNumber { return number.stringValue }
        return nil
    }

    var reviewDetails: [ReviewDetail] {
        let names: [(String, String)] = [
            ("target_title", "Tarea actual"),
            ("target_date", "Fecha anterior"),
            ("target_time", "Hora anterior"),
            ("title", "Título propuesto"),
            ("date", "Nueva fecha"),
            ("time", "Nueva hora"),
            ("reminder_time", "Recordatorio"),
            ("category", "Categoría"),
            ("project", "Proyecto"),
            ("notes", "Notas"),
            ("duration_minutes", "Duración en minutos"),
            ("all_day", "Día completo"),
            ("clear_date", "Quitar fecha")
        ]
        return names.compactMap { name, label in
            guard let value = Self.readable(candidate[name]) else { return nil }
            // False is not an active change. Explicit clear_date=true is shown.
            if ["all_day", "clear_date"].contains(name), value == "0" { return nil }
            return ReviewDetail(id: name, label: label,
                                value: ["all_day", "clear_date"].contains(name) && value == "1" ? "Sí" : value)
        }
    }
}

struct NativeChatResult {
    let reply: String
    let proposals: [NativeReviewProposal]
    let invalidProposalCount: Int
}

actor BackendClient {
    private let root: URL? = {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String
        else { return nil }
        return URL(string: value)
    }()
    private let publicKey: String =
        Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? ""
    private var session: StoredSession? = NativeKeychain.load()

    var isSignedIn: Bool { session != nil }

    private func url(_ path: String, query: [URLQueryItem]) throws -> URL {
        guard let root, root.scheme == "https", !publicKey.isEmpty,
              var components = URLComponents(url: root.appending(path: path),
                                             resolvingAgainstBaseURL: false) else {
            throw BackendError.notConfigured
        }
        if !query.isEmpty { components.queryItems = query }
        guard let result = components.url else { throw BackendError.invalidResponse }
        return result
    }

    private func network(_ path: String, method: String = "GET",
                         query: [URLQueryItem] = [], json: [String: Any]? = nil,
                         token: String? = nil) async throws -> Data {
        var req = URLRequest(url: try url(path, query: query))
        req.httpMethod = method
        req.setValue(publicKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + (token ?? publicKey), forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        req.timeoutInterval = 120
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw BackendError.invalidResponse }
        if !(200...299).contains(http.statusCode) {
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            let detail = body["msg"] as? String ?? body["message"] as? String
                ?? body["error_description"] as? String ?? body["error"] as? String
                ?? "HTTP " + String(http.statusCode)
            throw BackendError.rejected(detail)
        }
        return data
    }

    private func dict(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw BackendError.invalidResponse }
        return object
    }

    private func parseSession(_ data: Data) throws -> StoredSession {
        let obj = try dict(data)
        guard let access = obj["access_token"] as? String, !access.isEmpty,
              let refresh = obj["refresh_token"] as? String, !refresh.isEmpty,
              let user = obj["user"] as? [String: Any],
              let id = user["id"] as? String, UUID(uuidString: id) != nil,
              let expiry = obj["expires_in"] as? Int, expiry > 0 else {
            throw BackendError.invalidResponse
        }
        return StoredSession(accessToken: access, refreshToken: refresh, userID: id,
                             expiresAt: Date().timeIntervalSince1970 + Double(expiry))
    }

    func sendEmailCode(_ email: String) async throws {
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.contains("@"), clean.count < 255
        else { throw BackendError.rejected("Introduce el correo de tu cuenta MINDS.") }
        _ = try await network("auth/v1/otp", method: "POST",
                              json: ["email": clean, "create_user": false])
    }

    func verifyEmailCode(_ email: String, code: String) async throws {
        let clean = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { throw BackendError.rejected("Falta el código.") }
        let data = try await network("auth/v1/verify", method: "POST",
            json: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines),
                   "token": clean, "type": "email"])
        let verified = try parseSession(data)
        try NativeKeychain.save(verified)
        session = verified
    }

    private func access() async throws -> String {
        guard var stored = session else { throw BackendError.notSignedIn }
        if stored.expiresAt < Date().timeIntervalSince1970 + 90 {
            let data = try await network("auth/v1/token", method: "POST",
                query: [.init(name: "grant_type", value: "refresh_token")],
                json: ["refresh_token": stored.refreshToken])
            stored = try parseSession(data)
            try NativeKeychain.save(stored)
            session = stored
        }
        return stored.accessToken
    }

    func logout() async {
        let token = session?.accessToken
        session = nil
        NativeKeychain.clear()
        if let token { _ = try? await network("auth/v1/logout", method: "POST", token: token) }
    }

    func tasks() async throws -> [AgendaTask] {
        let token = try await access()
        let data = try await network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,title,due_date,completed_at,notes"),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "order", value: "due_date.asc.nullslast"),
            .init(name: "limit", value: "100")
        ], token: token)
        return try JSONDecoder().decode([AgendaTask].self, from: data)
    }

    // Siri reads an exact due-date slice, never the capped general agenda list.
    func todayTasks() async throws -> [AgendaTask] {
        let token = try await access()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let data = try await network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,title,due_date,completed_at,notes"),
            .init(name: "due_date", value: "eq." + today),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "completed_at", value: "is.null"),
            .init(name: "order", value: "title.asc")
        ], token: token)
        return try JSONDecoder().decode([AgendaTask].self, from: data)
    }

    func history() async throws -> [ChatMessage] {
        let token = try await access()
        let data = try await network("rest/v1/conversations", query: [
            .init(name: "select", value: "id"),
            .init(name: "app_scope", value: "eq.isabella"),
            .init(name: "order", value: "updated_at.desc"),
            .init(name: "limit", value: "1")
        ], token: token)
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let id = rows.first?["id"] as? String, UUID(uuidString: id) != nil else { return [] }
        let messageData = try await network("rest/v1/conversation_messages", query: [
            .init(name: "select", value: "id,role,content"),
            .init(name: "conversation_id", value: "eq." + id),
            .init(name: "order", value: "created_at.desc"),
            .init(name: "limit", value: "50")
        ], token: token)
        guard let messages = try JSONSerialization.jsonObject(with: messageData) as? [[String: Any]]
        else { throw BackendError.invalidResponse }
        return messages.reversed().compactMap { row in
            guard let text = row["content"] as? String,
                  let role = row["role"] as? String,
                  let id = row["id"] as? String, let uuid = UUID(uuidString: id),
                  ["user", "assistant"].contains(role) else { return nil }
            return ChatMessage(id: uuid, role: role == "user" ? .user : .assistant, text: text)
        }
    }

    // Restore only a proposal actually shown in the owner's Isabella conversation.
    // Neither model prose nor an old proposal is evidence that an action remains pending.
    func pendingReview() async throws -> NativeReviewProposal? {
        let token = try await access()
        guard let owner = session?.userID else { throw BackendError.notSignedIn }
        let conversations = try await network("rest/v1/conversations", query: [
            .init(name: "select", value: "id"),
            .init(name: "app_scope", value: "eq.isabella"),
            .init(name: "order", value: "updated_at.desc"),
            .init(name: "limit", value: "1")
        ], token: token)
        guard let rows = try JSONSerialization.jsonObject(with: conversations) as? [[String: Any]],
              let conversationID = rows.first?["id"] as? String,
              UUID(uuidString: conversationID) != nil else { return nil }
        let data = try await network("rest/v1/conversation_messages", query: [
            .init(name: "select", value: "metadata"),
            .init(name: "conversation_id", value: "eq." + conversationID),
            .init(name: "role", value: "eq.assistant"),
            .init(name: "order", value: "created_at.desc"),
            .init(name: "limit", value: "40")
        ], token: token)
        guard let messages = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { throw BackendError.invalidResponse }
        for message in messages {
            guard let meta = message["metadata"] as? [String: Any],
                  let proposals = meta["review_proposals"] as? [[String: Any]],
                  proposals.count == 1,
                  let candidate = proposals.first,
                  let proposal = NativeReviewProposal(json: candidate),
                  proposal.reviewable else { continue }
            let decisions = try await network("rest/v1/minds_shadow_decisions", query: [
                .init(name: "select", value: "status,action,proposal_kind"),
                .init(name: "request_id", value: "eq." + proposal.id),
                .init(name: "user_id", value: "eq." + owner),
                .init(name: "limit", value: "1")
            ], token: token)
            let records = try JSONSerialization.jsonObject(with: decisions) as? [[String: Any]]
            if let record = records?.first,
               record["status"] as? String == "pending",
               record["proposal_kind"] as? String == "task",
               record["action"] as? String == proposal.action + "_task" {
                return proposal
            }
        }
        return nil
    }

    func sendMessage(_ text: String, requestID: UUID) async throws -> NativeChatResult {
        let token = try await access()
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let clock = DateFormatter()
        clock.dateFormat = "yyyy-MM-dd'T'HH:mm"
        let time = DateFormatter()
        time.dateFormat = "HH:mm"
        let payload: [String: Any] = [
            "message": text,
            "context": ["client_current_date": fmt.string(from: Date()),
                        "current_date": fmt.string(from: Date()),
                        "current_local_datetime": clock.string(from: Date()),
                        "current_local_time": time.string(from: Date()),
                        "timezone": TimeZone.current.identifier,
                        "locale": Locale.current.identifier],
            "background": false, "attachments": [], "stream": false,
            "durable": false, "surface": "chat_browser",
            "client_message_id": requestID.uuidString.lowercased()
        ]
        let data = try await network("functions/v1/isabella-chat", method: "POST",
                                     json: payload, token: token)
        let result = try dict(data)
        if let error = result["error"] as? String {
            throw BackendError.rejected(result["message"] as? String ?? error)
        }
        // Server contract: one proposal is in "proposal", while "proposals" is [].
        // Always check the typed outcome, not the model's natural-language claim.
        let plural = result["proposals"] as? [[String: Any]] ?? []
        let proposals = !plural.isEmpty ? plural
            : (result["proposal"] as? [String: Any]).map { [$0] } ?? []
        guard let typed = result["outcome"] as? [String: Any],
              let outcome = typed["outcome"] as? String,
              let registeredCount = typed["proposal_count"] as? Int,
              let appliedCount = typed["applied_count"] as? Int,
              appliedCount == 0, registeredCount == proposals.count,
              (outcome == "answered" && proposals.isEmpty) ||
              (outcome == "proposal_created" && !proposals.isEmpty) else {
            throw BackendError.invalidResponse
        }
        let validated = proposals.compactMap(NativeReviewProposal.init(json:))
        let reply = result["reply"] as? String ?? ""
        guard !reply.isEmpty || !proposals.isEmpty else { throw BackendError.invalidResponse }
        return NativeChatResult(reply: reply, proposals: validated,
                                invalidProposalCount: proposals.count - validated.count)
    }

    // PostgREST and RPC can serialize the same instant with different UTC offsets.
    private func parseTimestamp(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        return ISO8601DateFormatter().date(from: raw)
    }

    func review(_ proposal: NativeReviewProposal, approve: Bool) async throws -> String {
        guard proposal.reviewable, UUID(uuidString: proposal.id) != nil
        else { throw BackendError.reviewUnavailable }
        let token = try await access()
        guard let owner = session?.userID else { throw BackendError.notSignedIn }
        if !approve {
            _ = try await network("rest/v1/rpc/minds_resolve_shadow_decision", method: "POST",
                json: ["p_request_id": proposal.id, "p_outcome": "rejected",
                       "p_reviewed": proposal.candidate], token: token)
            let data = try await network("rest/v1/minds_shadow_decisions", query: [
                .init(name: "select", value: "status"),
                .init(name: "request_id", value: "eq." + proposal.id),
                .init(name: "user_id", value: "eq." + owner),
                .init(name: "limit", value: "1")
            ], token: token)
            let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            guard rows?.first?["status"] as? String == "rejected"
            else { throw BackendError.verificationFailed }
            return "Propuesta cancelada y verificada."
        }
        let rpc = proposal.action == "create"
            ? "minds_commit_reviewed_task_create_v01"
            : "minds_commit_reviewed_task_update_v01"
        let response = try await network("rest/v1/rpc/" + rpc, method: "POST",
            json: ["p_request_id": proposal.id, "p_reviewed": proposal.candidate], token: token)
        let receipt = try dict(response)
        guard ["applied", "already_applied"].contains(receipt["status"] as? String ?? ""),
              let receiptID = receipt["receipt_id"] as? String, UUID(uuidString: receiptID) != nil,
              let entityID = receipt["entity_id"] as? String,
              let clientKey = receipt["entity_client_key"] as? String,
              let after = receipt["after"] as? [String: Any] else {
            throw BackendError.verificationFailed
        }
        let data = try await network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,title,due_date,updated_at"),
            .init(name: "user_id", value: "eq." + owner),
            .init(name: "client_key", value: "eq." + clientKey),
            .init(name: "limit", value: "1")
        ], token: token)
        let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        guard let row = rows?.first, rows?.count == 1,
              row["id"] as? String == entityID,
              row["title"] as? String == after["title"] as? String,
              row["due_date"] as? String == after["date"] as? String,
              let rawActual = row["updated_at"] as? String,
              let rawExpected = after["updated_at"] as? String,
              let actual = parseTimestamp(rawActual),
              let expected = parseTimestamp(rawExpected),
              abs(actual.timeIntervalSince(expected)) < 0.001 else {
            throw BackendError.verificationFailed
        }
        return "Cambio confirmado y verificado en Supabase."
    }
}
