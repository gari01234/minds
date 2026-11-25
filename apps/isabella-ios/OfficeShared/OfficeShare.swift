import Foundation
import Security

// Saving into the Desktop of a TBA Office project from the iOS share sheet (Outlook: «Drucken» →
// PDF, attachments with «Teilen»). Same storage path and row as the office web page
// (app/work.js uploadFiles): minds-work/<user>/<project>/<folder or root>/<time>-<random>-<safe
// name>, then a minds_work_files row. RLS and the team guard decide; nothing here widens access.
// The share sheet never refreshes a session (Supabase rotates refresh tokens; the app is their only
// owner): with an expired access token it stages the file and the app uploads it when it opens.
// Compiled into the app and the Share Extension.

struct OfficeShareProject: Codable, Hashable, Identifiable {
    let id: String          // office_projects.id, which is also the project's client_key
    let name: String
    let number: String?
    var label: String {
        [number, name].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " ")
    }
}

struct OfficeShareFolder: Codable, Hashable, Identifiable {
    let id: String
    let parentID: String?
    let name: String
}

struct OfficeShareTarget: Codable, Hashable {
    let projectID: String
    let projectLabel: String
    let folderID: String?
    let folderLabel: String?
    var label: String { [projectLabel, folderLabel].compactMap { $0 }.joined(separator: " › ") }
}

struct OfficeShareAccess {
    let accessToken: String
    let userID: String
}

enum OfficeShareError: LocalizedError {
    case notConfigured, http(Int), invalidResponse, noAppGroup, tooLarge

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Office ist in dieser App nicht eingerichtet."
        case .http(let code): return "Office antwortet gerade nicht (HTTP \(code))."
        case .invalidResponse: return "Office hat unerwartet geantwortet."
        case .noAppGroup: return "Der gemeinsame Speicher der App fehlt."
        case .tooLarge: return "Die Datei ist größer als 50 MB."
        }
    }
}

// The office address, publishable key and App Group, from the Info.plist of the app or the extension.
enum OfficeShareConfig {
    static let maxBytes = 50 * 1024 * 1024
    static var url: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "OFFICE_SUPABASE_URL") as? String,
              let url = URL(string: value), url.scheme == "https" else { return nil }
        return url
    }
    static var key: String { Bundle.main.object(forInfoDictionaryKey: "OFFICE_SUPABASE_KEY") as? String ?? "" }
    static var group: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MINDSAppGroupID") as? String,
              value.hasPrefix("group.") else { return nil }
        return value
    }
}

// Reads the office session the app keeps under the App Group (OfficeKeychain). Read only.
enum OfficeShareKeychain {
    private static let key = "tba.office.native.session"

    private static func stored() -> [String: Any]? {
        guard let group = OfficeShareConfig.group else { return nil }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: key,
                                    kSecAttrAccount as String: key,
                                    kSecAttrAccessGroup as String: group,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return object
    }

    static var userID: String? {
        guard let id = stored()?["userID"] as? String, UUID(uuidString: id) != nil else { return nil }
        return id.lowercased()
    }

    static var isSignedIn: Bool { userID != nil }

    // Only a token that stays valid for a while: the upload must not outlive it.
    static func access(minimumValidity: TimeInterval = 120) -> OfficeShareAccess? {
        guard let session = stored(),
              let token = session["accessToken"] as? String, !token.isEmpty,
              let id = session["userID"] as? String, UUID(uuidString: id) != nil,
              let expires = session["expiresAt"] as? Double,
              expires > Date().timeIntervalSince1970 + minimumValidity else { return nil }
        return OfficeShareAccess(accessToken: token, userID: id.lowercased())
    }
}

// The share sheet's memory in the App Group: the last target, the projects and folders the app saw
// (for when the sheet's own access has expired) and the files waiting for the app.
enum OfficeShareStore {
    struct Cache: Codable {
        let userID: String
        let projects: [OfficeShareProject]
        let folders: [String: [OfficeShareFolder]]
        let savedAt: Date
    }

    struct Pending: Codable, Identifiable {
        let id: UUID
        let userID: String
        let name: String
        let mime: String
        let size: Int
        let target: OfficeShareTarget
        let createdAt: Date
    }

    private static let cacheKey = "office.share.cache.v1"
    private static let lastKey = "office.share.last.v1"

    private static var defaults: UserDefaults? {
        OfficeShareConfig.group.flatMap { UserDefaults(suiteName: $0) }
    }

    static func saveCache(_ cache: Cache) {
        if let data = try? JSONEncoder().encode(cache) { defaults?.set(data, forKey: cacheKey) }
    }

    // Only the signed-in person's, and not older than 30 days.
    static func loadCache(userID: String) -> Cache? {
        guard let data = defaults?.data(forKey: cacheKey),
              let cache = try? JSONDecoder().decode(Cache.self, from: data),
              cache.userID == userID,
              Date().timeIntervalSince(cache.savedAt) < 30 * 86_400 else { return nil }
        return cache
    }

    static func saveLast(_ target: OfficeShareTarget) {
        if let data = try? JSONEncoder().encode(target) { defaults?.set(data, forKey: lastKey) }
    }

    static func loadLast() -> OfficeShareTarget? {
        guard let data = defaults?.data(forKey: lastKey) else { return nil }
        return try? JSONDecoder().decode(OfficeShareTarget.self, from: data)
    }

    static func directory(_ name: String) throws -> URL {
        guard let group = OfficeShareConfig.group,
              let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
        else { throw OfficeShareError.noAppGroup }
        let url = root.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // Files the share sheet received, before they are saved or staged. Older than a day: dropped.
    static func incomingDirectory() throws -> URL {
        let url = try directory("OfficeShareIncoming")
        let old = Date().addingTimeInterval(-86_400)
        for item in (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] {
            let changed = (try? item.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            if changed < old { try? FileManager.default.removeItem(at: item) }
        }
        return url
    }

    static func payloadURL(_ item: Pending) throws -> URL {
        try directory("PendingOfficeUploads").appendingPathComponent(item.id.uuidString.lowercased() + ".source")
    }

    // Moves a received file into the queue for the app, with its target and owner.
    @discardableResult
    static func stage(fileAt url: URL, name: String, mime: String, target: OfficeShareTarget,
                      userID: String) throws -> Pending {
        let directory = try directory("PendingOfficeUploads")
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= OfficeShareConfig.maxBytes else { throw OfficeShareError.tooLarge }
        let item = Pending(id: UUID(), userID: userID, name: name, mime: mime, size: size,
                           target: target, createdAt: Date())
        let stem = item.id.uuidString.lowercased()
        let payload = directory.appendingPathComponent(stem + ".source")
        let manifest = directory.appendingPathComponent(stem + ".json")
        do {
            try FileManager.default.moveItem(at: url, to: payload)
            try JSONEncoder().encode(item).write(to: manifest, options: .atomic)
            for path in [payload.path, manifest.path] {
                try FileManager.default.setAttributes(
                    [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: path)
            }
        } catch {
            try? FileManager.default.removeItem(at: manifest)
            try? FileManager.default.removeItem(at: payload)
            throw error
        }
        return item
    }

    static func pending() -> [Pending] {
        guard let directory = try? directory("PendingOfficeUploads"),
              let names = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        else { return [] }
        return names.filter { $0.pathExtension == "json" }
            .compactMap { try? JSONDecoder().decode(Pending.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    static func remove(_ item: Pending) {
        guard let directory = try? directory("PendingOfficeUploads") else { return }
        let stem = item.id.uuidString.lowercased()
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(stem + ".source"))
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(stem + ".json"))
    }

    // Signing out of Office: nothing of that person stays for the next one.
    static func clearAll() {
        defaults?.removeObject(forKey: cacheKey)
        defaults?.removeObject(forKey: lastKey)
        for name in ["PendingOfficeUploads", "OfficeShareIncoming"] {
            if let url = try? directory(name) { try? FileManager.default.removeItem(at: url) }
        }
    }
}

// Talks to TBA Office with the person's own access token (RLS decides what they may see and save).
struct OfficeShareUploader {
    let access: OfficeShareAccess

    private func request(_ path: String, method: String = "GET", query: [URLQueryItem] = [],
                         headers: [String: String] = [:]) throws -> URLRequest {
        let key = OfficeShareConfig.key
        guard let root = OfficeShareConfig.url, !key.isEmpty,
              var components = URLComponents(url: root.appending(path: path), resolvingAgainstBaseURL: false)
        else { throw OfficeShareError.notConfigured }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw OfficeShareError.invalidResponse }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 120
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + access.accessToken, forHTTPHeaderField: "Authorization")
        headers.forEach { req.setValue($0.value, forHTTPHeaderField: $0.key) }
        return req
    }

    private func checked(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw OfficeShareError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw OfficeShareError.http(http.statusCode) }
    }

    private func rows(_ req: URLRequest) async throws -> [[String: Any]] {
        let (data, response) = try await URLSession.shared.data(for: req)
        try checked(response)
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw OfficeShareError.invalidResponse
        }
        return rows
    }

    // The active projects in whose team this person is: only there may they save (team guard).
    func projects() async throws -> [OfficeShareProject] {
        let list = try await rows(request("rest/v1/office_project_members", query: [
            URLQueryItem(name: "select", value: "project_id,office_projects(id,name,number,status)"),
            URLQueryItem(name: "user_id", value: "eq." + access.userID),
            URLQueryItem(name: "limit", value: "200")]))
        return list.compactMap { row in
            guard let project = row["office_projects"] as? [String: Any],
                  project["status"] as? String == "aktiv",
                  let id = project["id"] as? String, UUID(uuidString: id) != nil,
                  let name = project["name"] as? String else { return nil }
            return OfficeShareProject(id: id.lowercased(), name: name, number: project["number"] as? String)
        }.sorted {
            let order = ($0.number ?? "~").localizedStandardCompare($1.number ?? "~")
            return order == .orderedSame ? $0.name.localizedStandardCompare($1.name) == .orderedAscending
                                         : order == .orderedAscending
        }
    }

    // The folders of the Desktop of these projects, grouped by project.
    func folders(projectIDs: [String]) async throws -> [String: [OfficeShareFolder]] {
        let ids = projectIDs.filter { UUID(uuidString: $0) != nil }
        guard !ids.isEmpty else { return [:] }
        let list = try await rows(request("rest/v1/minds_work_folders", query: [
            URLQueryItem(name: "select", value: "id,parent_id,name,project_id"),
            URLQueryItem(name: "project_id", value: "in.(" + ids.joined(separator: ",") + ")"),
            URLQueryItem(name: "order", value: "name.asc"),
            URLQueryItem(name: "limit", value: "2000")]))
        var out: [String: [OfficeShareFolder]] = [:]
        for row in list {
            guard let id = row["id"] as? String, let project = row["project_id"] as? String,
                  let name = row["name"] as? String else { continue }
            out[project.lowercased(), default: []].append(
                OfficeShareFolder(id: id.lowercased(), parentID: (row["parent_id"] as? String)?.lowercased(), name: name))
        }
        return out
    }

    // Like the web page: the file into storage, then its row; without the row the file goes again.
    func upload(fileAt url: URL, name: String, mime: String, target: OfficeShareTarget) async throws {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= OfficeShareConfig.maxBytes else { throw OfficeShareError.tooLarge }
        let clean = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(255))
        let display = clean.isEmpty ? "Datei" : clean
        let path = Self.storagePath(userID: access.userID, projectID: target.projectID,
                                    folderID: target.folderID, name: display)
        let store = try request("storage/v1/object/minds-work/" + path, method: "POST",
                                headers: ["Content-Type": mime, "x-upsert": "false"])
        let (_, stored) = try await URLSession.shared.upload(for: store, fromFile: url)
        try checked(stored)
        do {
            var insert = try request("rest/v1/minds_work_files", method: "POST",
                                     headers: ["Content-Type": "application/json", "Prefer": "return=minimal"])
            insert.httpBody = try JSONSerialization.data(withJSONObject: [
                "project_id": target.projectID,
                "folder_id": target.folderID.map { $0 as Any } ?? NSNull(),
                "name": display,
                "mime_type": mime,
                "size_bytes": size,
                "storage_path": path,
                "source_kind": Self.sourceKind(name: display, mime: mime),
                "metadata": ["source": "ios-share"]
            ] as [String: Any])
            let (_, response) = try await URLSession.shared.data(for: insert)
            try checked(response)
        } catch {
            if let remove = try? request("storage/v1/object/minds-work/" + path, method: "DELETE") {
                _ = try? await URLSession.shared.data(for: remove)
            }
            throw error
        }
    }

    static func storagePath(userID: String, projectID: String, folderID: String?, name: String) -> String {
        let millis = Int(Date().timeIntervalSince1970 * 1000)
        let letters = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        let random = String((0..<6).map { _ in letters.randomElement()! })
        return "\(userID)/\(projectID)/\(folderID ?? "root")/\(millis)-\(random)-\(safeName(name))"
    }

    // As safeName in app/work.js.
    static func safeName(_ name: String) -> String {
        let replaced = name.replacingOccurrences(of: "[^a-zA-Z0-9._-]+", with: "-", options: .regularExpression)
        let trimmed = replaced.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let short = String(trimmed.prefix(150))
        return short.isEmpty ? "file" : short
    }

    // As sourceKind in app/work.js.
    static func sourceKind(name: String, mime: String) -> String {
        let lower = name.lowercased()
        if lower.hasSuffix(".eml") || lower.hasSuffix(".msg") || mime == "message/rfc822" { return "email" }
        if mime.hasPrefix("image/") { return "image" }
        if lower.range(of: "\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$", options: .regularExpression) != nil {
            return "document"
        }
        return "file"
    }
}
