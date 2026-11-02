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
    var email: String?
}

// What the web app and the extensions may see of the session: never the refresh token.
struct BridgeSession {
    let accessToken: String
    let expiresAt: TimeInterval
    let userID: String
    let email: String?
}

// The app is the only owner of the session. It lives in the Keychain under the
// App Group, so the Share Extension, the widget and App Intents use the same one.
// Readable after the first unlock: widgets and notification actions run while locked.
private enum NativeKeychain {
    static let key = "minds.isabella.native.owner.session"
    static var group: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MINDSAppGroupID") as? String,
              value.hasPrefix("group.") else { return nil }
        return value
    }
    static func selector(shared: Bool) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: key,
            kSecAttrAccount as String: key
        ]
        if shared, let group { query[kSecAttrAccessGroup as String] = group }
        return query
    }
    private static func read(shared: Bool) -> StoredSession? {
        var query = selector(shared: shared)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }
    static func load() -> StoredSession? {
        if let current = read(shared: true) { return current }
        guard let group else { return nil }
        // A session saved by a build before the shared group: move it once.
        // Delete only that old item (by its own access group), never the new one.
        var query = selector(shared: false)
        query[kSecReturnAttributes as String] = true
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let item = value as? [String: Any],
              let data = item[kSecValueData as String] as? Data,
              let legacy = try? JSONDecoder().decode(StoredSession.self, from: data) else { return nil }
        if let oldGroup = item[kSecAttrAccessGroup as String] as? String, oldGroup != group,
           (try? save(legacy)) != nil {
            var old = selector(shared: false)
            old[kSecAttrAccessGroup as String] = oldGroup
            SecItemDelete(old as CFDictionary)
        }
        return legacy
    }
    static func save(_ session: StoredSession) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(selector(shared: true) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var new = selector(shared: true)
            attributes.forEach { new[$0.key] = $0.value }
            guard SecItemAdd(new as CFDictionary, nil) == errSecSuccess else {
                throw BackendError.verificationFailed
            }
        } else if status != errSecSuccess {
            throw BackendError.verificationFailed
        }
    }
    static func clear() {
        SecItemDelete(selector(shared: true) as CFDictionary)
        SecItemDelete(selector(shared: false) as CFDictionary)
    }
}

struct AgendaTask: Identifiable, Decodable {
    let id: UUID
    let title: String
    let dueDate: String?
    let completedAt: String?
    let notes: String?
    let reminderTime: String?
    enum CodingKeys: String, CodingKey {
        case id, title, notes
        case dueDate = "due_date"
        case completedAt = "completed_at"
        case reminderTime = "reminder_time"
    }
}

struct AgendaEvent: Identifiable, Decodable {
    struct Meta: Decodable {
        let kind: String?
        let taskClientKey: String?
        enum CodingKeys: String, CodingKey {
            case kind
            case taskClientKey = "task_client_key"
        }
    }

    let id: UUID
    let title: String
    let startsAt: String
    let endsAt: String?
    let allDay: Bool
    let metadata: Meta?

    enum CodingKeys: String, CodingKey {
        case id, title, metadata
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case allDay = "all_day"
    }

    // A block of time reserved to work on a task (shown with the task, like the web app).
    var sessionTaskKey: String? { metadata?.kind == "task_work_session_v1" ? metadata?.taskClientKey : nil }

    var endDate: Date? {
        guard let endsAt else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: endsAt) ?? ISO8601DateFormatter().date(from: endsAt)
    }

    var startDate: Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: startsAt)
            ?? ISO8601DateFormatter().date(from: startsAt)
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
    private var refreshing: Task<StoredSession, Error>?

    var isSignedIn: Bool {
        if session == nil { session = NativeKeychain.load() }
        return session != nil
    }

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
                         token: String? = nil, prefer: String? = nil) async throws -> Data {
        var req = URLRequest(url: try url(path, query: query))
        req.httpMethod = method
        req.setValue(publicKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + (token ?? publicKey), forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let prefer { req.setValue(prefer, forHTTPHeaderField: "Prefer") }
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
                             expiresAt: Date().timeIntervalSince1970 + Double(expiry),
                             email: user["email"] as? String)
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

    // One refresh at a time: Supabase rotates refresh tokens, so two refreshes
    // with the same token would sign the other one out. Another process (widget,
    // Share Extension) may already have refreshed: read the Keychain first.
    private func validSession() async throws -> StoredSession {
        if let refreshing { return try await refreshing.value }
        if let stored = NativeKeychain.load(), stored.expiresAt > (session?.expiresAt ?? 0) {
            session = stored
        }
        guard let stored = session else { throw BackendError.notSignedIn }
        if stored.expiresAt >= Date().timeIntervalSince1970 + 90 { return stored }
        let task = Task { () throws -> StoredSession in
            let data: Data
            do {
                data = try await network("auth/v1/token", method: "POST",
                    query: [.init(name: "grant_type", value: "refresh_token")],
                    json: ["refresh_token": stored.refreshToken])
            } catch BackendError.rejected(let detail) where detail.lowercased().contains("refresh token") {
                // Revoked or already used elsewhere: sign in again instead of failing forever.
                NativeKeychain.clear()
                session = nil
                throw BackendError.notSignedIn
            }
            var fresh = try parseSession(data)
            if fresh.email == nil { fresh.email = stored.email }
            try NativeKeychain.save(fresh)
            return fresh
        }
        refreshing = task
        defer { refreshing = nil }
        let fresh = try await task.value
        session = fresh
        return fresh
    }

    private func access() async throws -> String {
        try await validSession().accessToken
    }

    // For the web app (through the bridge) and the extensions.
    func bridgeSession() async throws -> BridgeSession? {
        guard isSignedIn else { return nil }
        let stored = try await validSession()
        return BridgeSession(accessToken: stored.accessToken, expiresAt: stored.expiresAt,
                             userID: stored.userID, email: stored.email)
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
            .init(name: "select", value: "id,title,due_date,completed_at,notes,reminder_time"),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "order", value: "due_date.asc.nullslast"),
            .init(name: "limit", value: "100")
        ], token: token)
        return try JSONDecoder().decode([AgendaTask].self, from: data)
    }

    // Reminders are not derived from the capped agenda UI. Only canonical,
    // owner-RLS, incomplete tasks with an explicit future date and reminder time.
    func localReminderTasks() async throws -> [AgendaTask] {
        let token = try await access()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let data = try await network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,title,due_date,completed_at,notes,reminder_time"),
            .init(name: "due_date", value: "gte." + today),
            .init(name: "reminder_time", value: "not.is.null"),
            .init(name: "completed_at", value: "is.null"),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "order", value: "due_date.asc"),
            .init(name: "limit", value: "100")
        ], token: token)
        return try JSONDecoder().decode([AgendaTask].self, from: data)
    }

    func events() async throws -> [AgendaEvent] {
        let token = try await access()
        // Start from local midnight to include today's earlier events.
        let start = Calendar.current.startOfDay(for: Date())
        let utc = ISO8601DateFormatter().string(from: start)
        let data = try await network("rest/v1/isabella_events", query: [
            .init(name: "select", value: "id,title,starts_at,ends_at,all_day,metadata"),
            .init(name: "starts_at", value: "gte." + utc),
            .init(name: "order", value: "starts_at.asc"),
            .init(name: "limit", value: "100")
        ], token: token)
        return try JSONDecoder().decode([AgendaEvent].self, from: data)
    }

    // Siri reads an exact due-date slice, never the capped general agenda list.
    // Owner-scoped read model: four canonical sources, zero mutations.
    // No LLM summarization, heuristic score, or inferred approval.
    func continuityItems() async throws -> [ContinuityItem] {
        let token = try await access()
        guard let owner = session?.userID else { throw BackendError.notSignedIn }
        let ownerFilter = URLQueryItem(name: "user_id", value: "eq." + owner)

        async let decisions = network("rest/v1/minds_shadow_decisions", query: [
            .init(name: "select", value: "request_id,action,proposal_kind,status"),
            ownerFilter, .init(name: "status", value: "eq.pending"),
            .init(name: "order", value: "created_at.desc"),
            .init(name: "limit", value: "10")
        ], token: token)
        async let attention = network("rest/v1/minds_attention_events", query: [
            .init(name: "select", value: "id,title,body,status,requires_user"),
            ownerFilter, .init(name: "status", value: "eq.delivered"),
            .init(name: "requires_user", value: "eq.true"),
            .init(name: "consumed_at", value: "is.null"),
            .init(name: "order", value: "created_at.desc"),
            .init(name: "limit", value: "10")
        ], token: token)
        async let missions = network("rest/v1/minds_mission_runs", query: [
            .init(name: "select", value: "id,instruction,status,blocker_question"),
            ownerFilter, .init(name: "status", value: "in.(paused,waiting,in_progress)"),
            .init(name: "order", value: "updated_at.desc"),
            .init(name: "limit", value: "10")
        ], token: token)
        async let commitments = network("rest/v1/minds_commitments", query: [
            .init(name: "select", value: "id,title,objective,status"),
            ownerFilter, .init(name: "status", value: "eq.active"),
            .init(name: "order", value: "updated_at.desc"),
            .init(name: "limit", value: "10")
        ], token: token)

        func rows(_ data: Data) throws -> [[String: Any]] {
            guard let records = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            else { throw BackendError.invalidResponse }
            return records
        }
        let (decisionData, attentionData, missionData, commitmentData) =
            try await (decisions, attention, missions, commitments)
        var items: [ContinuityItem] = []
        for row in try rows(decisionData) {
            guard let id = row["request_id"] as? String, let uuid = UUID(uuidString: id),
                  row["status"] as? String == "pending" else { continue }
            let kind = row["proposal_kind"] as? String ?? "desconocido"
            items.append(ContinuityItem(
                id: "review:" + id, kind: .review,
                title: "Propuesta pendiente",
                detail: "Tipo: " + kind + ". Debe revisarse en el contexto original.",
                sourceState: "pending", sourceID: uuid))
        }
        for row in try rows(attentionData) {
            guard let id = row["id"] as? String, let uuid = UUID(uuidString: id),
                  row["requires_user"] as? Bool == true,
                  row["status"] as? String == "delivered" else { continue }
            items.append(ContinuityItem(
                id: "attention:" + id, kind: .attention,
                title: row["title"] as? String ?? "Atención registrada",
                detail: row["body"] as? String ?? "Consulta el asunto original.",
                sourceState: "delivered", sourceID: uuid))
        }
        for row in try rows(missionData) {
            guard let id = row["id"] as? String, let uuid = UUID(uuidString: id),
                  let status = row["status"] as? String,
                  ["paused", "waiting", "in_progress"].contains(status) else { continue }
            let stateText = status == "paused" ? "Pausada" :
                status == "waiting" ? "Esperando una condición" : "En ejecución"
            let blocker = (row["blocker_question"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let detail = blocker?.isEmpty == false ? blocker! : stateText
            items.append(ContinuityItem(
                id: "mission:" + id, kind: .mission,
                title: row["instruction"] as? String ?? "Trabajo registrado",
                detail: detail, sourceState: status, sourceID: uuid))
        }
        for row in try rows(commitmentData) {
            guard let id = row["id"] as? String, let uuid = UUID(uuidString: id),
                  row["status"] as? String == "active" else { continue }
            items.append(ContinuityItem(
                id: "commitment:" + id, kind: .commitment,
                title: row["title"] as? String ?? "Compromiso",
                detail: row["objective"] as? String ?? "Compromiso activo.",
                sourceState: "active", sourceID: uuid))
        }
        return items
    }

    func todayTasks() async throws -> [AgendaTask] {
        let token = try await access()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let data = try await network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,title,due_date,completed_at,notes,reminder_time"),
            .init(name: "due_date", value: "eq." + today),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "completed_at", value: "is.null"),
            .init(name: "order", value: "title.asc")
        ], token: token)
        return try JSONDecoder().decode([AgendaTask].self, from: data)
    }

    // MARK: Ahora and Bandeja (the same rows and rules as the web app's Panorama)

    private func rows(_ data: Data) throws -> [[String: Any]] {
        guard let list = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { throw BackendError.invalidResponse }
        return list
    }

    private static func stamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }

    // Entries Isabella proposed and Gari has not decided yet, across projects.
    func pendingAkteEntries() async throws -> [AkteEntry] {
        let token = try await access()
        let data = try await network("rest/v1/minds_work_memory", query: [
            .init(name: "select", value: "id,project_id,memory_type,title,body,status,occurred_at,metadata,created_at,isabella_projects(name,client_key)"),
            .init(name: "status", value: "eq.proposed"),
            .init(name: "memory_type", value: "in.(deadline,decision,commitment,open_question)"),
            .init(name: "order", value: "created_at.desc"),
            .init(name: "limit", value: "100")
        ], token: token)
        return try rows(data).compactMap(AkteEntry.init(json:))
    }

    // Confirmed Fristen from today on, soonest first.
    func upcomingFristen() async throws -> [AkteEntry] {
        let token = try await access()
        let start = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))
        let data = try await network("rest/v1/minds_work_memory", query: [
            .init(name: "select", value: "id,project_id,memory_type,title,body,status,occurred_at,metadata,created_at,isabella_projects(name,client_key)"),
            .init(name: "status", value: "eq.confirmed"),
            .init(name: "memory_type", value: "eq.deadline"),
            .init(name: "occurred_at", value: "gte." + start),
            .init(name: "order", value: "occurred_at.asc"),
            .init(name: "limit", value: "10")
        ], token: token)
        return try rows(data).compactMap(AkteEntry.init(json:))
    }

    // Confirmed / rejected / resolved, only while still proposed; done only if the row says so.
    func decideAkteEntry(id: String, status: String) async throws {
        guard ["confirmed", "rejected", "resolved"].contains(status), UUID(uuidString: id) != nil
        else { throw BackendError.invalidResponse }
        let token = try await access()
        let now = Self.stamp()
        var patch: [String: Any] = ["status": status, "updated_at": now]
        if status == "confirmed" { patch["confirmed_at"] = now }
        let data = try await network("rest/v1/minds_work_memory", method: "PATCH", query: [
            .init(name: "id", value: "eq." + id),
            .init(name: "status", value: "eq.proposed")
        ], json: patch, token: token, prefer: "return=representation")
        let saved = try rows(data)
        guard saved.count == 1, saved[0]["status"] as? String == status else {
            throw BackendError.rejected("Esta propuesta ya no está pendiente.")
        }
    }

    // A proposed Aufgabe becomes a real task in the project, then the entry is confirmed.
    func akteEntryToTask(id: String) async throws {
        guard UUID(uuidString: id) != nil else { throw BackendError.invalidResponse }
        let token = try await access()
        let found = try rows(try await network("rest/v1/minds_work_memory", query: [
            .init(name: "select", value: "id,title,occurred_at,metadata,status,project_id"),
            .init(name: "id", value: "eq." + id)
        ], token: token))
        guard let entry = found.first, entry["status"] as? String == "proposed" else {
            throw BackendError.rejected("Esta propuesta ya no está pendiente.")
        }
        let meta = entry["metadata"] as? [String: Any] ?? [:]
        let due = (meta["faellig"] as? String) ?? (entry["occurred_at"] as? String).map { String($0.prefix(10)) }
        let task: [String: Any] = [
            "title": entry["title"] as? String ?? "",
            "project_id": entry["project_id"].map { $0 as Any } ?? NSNull(),
            "due_date": due.map { $0 as Any } ?? NSNull(),
            "work_status": "not_started",
            "notes": (meta["quelle"] as? String).map { "Quelle: " + $0 } ?? "",
            "metadata": ["source": "akte_pflege", "memory_id": id]
        ]
        let created = try rows(try await network("rest/v1/isabella_tasks", method: "POST",
                                                 json: task, token: token, prefer: "return=representation"))
        guard let taskID = created.first?["id"] as? String else { throw BackendError.verificationFailed }
        var newMeta = meta
        newMeta["task_id"] = taskID
        let now = Self.stamp()
        let saved = try rows(try await network("rest/v1/minds_work_memory", method: "PATCH", query: [
            .init(name: "id", value: "eq." + id),
            .init(name: "status", value: "eq.proposed")
        ], json: ["status": "confirmed", "confirmed_at": now, "updated_at": now, "metadata": newMeta],
           token: token, prefer: "return=representation"))
        guard saved.count == 1 else { throw BackendError.verificationFailed }
    }

    // The day's tasks exactly as the web app lists them (tasksForDay): due that day,
    // done or not, plus unfinished tasks whose start–due window spans the day.
    func dayTasks() async throws -> [DayTask] {
        let token = try await access()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        async let taskData = network("rest/v1/isabella_tasks", query: [
            .init(name: "select", value: "id,client_key,title,due_date,start_date,completed_at,sort_order,project_id,category_id"),
            .init(name: "archived_at", value: "is.null"),
            .init(name: "or", value: "(due_date.eq.\(today),and(start_date.lte.\(today),due_date.gt.\(today),completed_at.is.null))"),
            .init(name: "limit", value: "100")
        ], token: token)
        async let projectData = network("rest/v1/isabella_projects", query: [.init(name: "select", value: "id,name")], token: token)
        async let categoryData = network("rest/v1/isabella_categories", query: [.init(name: "select", value: "id,name")], token: token)
        let (t, p, c) = try await (taskData, projectData, categoryData)
        let names = { (rows: [[String: Any]]) -> [String: String] in
            Dictionary(rows.compactMap { row in
                guard let id = row["id"] as? String, let name = row["name"] as? String else { return nil }
                return (id, name)
            }, uniquingKeysWith: { first, _ in first })
        }
        let projects = names(try rows(p)), categories = names(try rows(c))
        return try rows(t).compactMap { DayTask(json: $0, today: today, projects: projects, categories: categories) }
            .sorted { a, b in
                if a.done != b.done { return !a.done }
                if a.isSpan != b.isSpan { return !a.isSpan }
                if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
                return a.title.localizedCompare(b.title) == .orderedAscending
            }
    }

    // Isabella's current situation cards (the web app keeps them fresh), newest generation only.
    func feedItems() async throws -> [FeedItem] {
        let token = try await access()
        let data = try await network("rest/v1/minds_surface_items", query: [
            .init(name: "select", value: "*"),
            .init(name: "surface", value: "eq.feed"),
            .init(name: "status", value: "eq.active"),
            .init(name: "agent", value: "eq.isabella"),
            .init(name: "order", value: "generated_at.desc"),
            .init(name: "limit", value: "40")
        ], token: token)
        let list = try rows(data)
        let generation = (list.first?["metadata"] as? [String: Any])?["generation_id"] as? String
        return list
            .filter { generation == nil || (($0["metadata"] as? [String: Any])?["generation_id"] as? String) == generation }
            .compactMap(FeedItem.init(json:))
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
