import Foundation
import CryptoKit
import UniformTypeIdentifiers

// Local, provenance-preserving staging. A capture is NOT a memory, a Work
// document, a project claim, or an authorized backend mutation.
struct CapturedSource: Codable, Identifiable {
    let id: UUID
    let title: String
    let contentKind: String
    let mimeType: String
    let originalSourceURL: String?
    let createdAt: Date
    let byteCount: Int
    let sha256: String
    let payloadFileName: String
}

enum CaptureInboxError: LocalizedError {
    case noAppGroup
    case oversize
    case missingPayload

    var errorDescription: String? {
        switch self {
        case .noAppGroup:
            return "La configuración de intercambio privado de MINDS no está disponible."
        case .oversize:
            return "El contenido supera los 12 MiB admitidos por esta captura inicial."
        case .missingPayload:
            return "El archivo temporal ya no está disponible."
        }
    }
}

enum CaptureInboxStore {
    static let maxBytes = 12 * 1024 * 1024

    static func container() throws -> URL {
        guard let name = Bundle.main.object(forInfoDictionaryKey: "MINDSAppGroupID") as? String,
              name.hasPrefix("group."),
              let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: name)
        else { throw CaptureInboxError.noAppGroup }
        let inbox = url.appendingPathComponent("PendingCaptures", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        return inbox
    }

    @discardableResult
    static func stageText(_ text: String, sourceURL: URL? = nil) throws -> CapturedSource {
        let payload = Data(text.utf8)
        return try stage(payload, title: sourceURL?.absoluteString ?? "Texto compartido",
                         kind: sourceURL == nil ? "text" : "url",
                         mime: "text/plain",
                         sourceURL: sourceURL?.absoluteString)
    }

    @discardableResult
    static func stageFile(_ url: URL, originalName: String? = nil,
                          mime: String = "application/octet-stream") throws -> CapturedSource {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw CaptureInboxError.missingPayload
        }
        if let bytes = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
           bytes > maxBytes { throw CaptureInboxError.oversize }
        let raw = try Data(contentsOf: url)
        return try stage(raw, title: originalName ?? url.lastPathComponent,
                         kind: "file", mime: mime, sourceURL: nil)
    }

    private static func stage(_ data: Data, title: String, kind: String,
                              mime: String, sourceURL: String?) throws -> CapturedSource {
        guard data.count <= maxBytes else { throw CaptureInboxError.oversize }
        let directory = try container()
        let id = UUID()
        let stem = id.uuidString.lowercased()
        let payloadName = stem + ".source"
        let fileURL = directory.appendingPathComponent(payloadName)
        let manifestURL = directory.appendingPathComponent(stem + ".json")
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let source = CapturedSource(
            id: id, title: title, contentKind: kind, mimeType: mime,
            originalSourceURL: sourceURL, createdAt: Date(),
            byteCount: data.count, sha256: digest, payloadFileName: payloadName
        )
        do {
            try data.write(to: fileURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: fileURL.path
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(source).write(to: manifestURL, options: .atomic)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: manifestURL.path
            )
        } catch {
            try? FileManager.default.removeItem(at: manifestURL)
            try? FileManager.default.removeItem(at: fileURL)
            throw error
        }
        return source
    }

    static func list() throws -> [CapturedSource] {
        let directory = try container()
        let names = try FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        return try names.map { url in
            let candidate = try JSONDecoder().decode(CapturedSource.self,
                                                      from: Data(contentsOf: url))
            let payload = directory.appendingPathComponent(candidate.payloadFileName)
            guard FileManager.default.fileExists(atPath: payload.path) else {
                throw CaptureInboxError.missingPayload
            }
            return candidate
        }.sorted { $0.createdAt > $1.createdAt }
    }

    static func discard(_ item: CapturedSource) throws {
        let dir = try container()
        // Construct paths exclusively from our own verified UUID.
        let stem = item.id.uuidString.lowercased()
        let payload = dir.appendingPathComponent(stem + ".source")
        let manifest = dir.appendingPathComponent(stem + ".json")
        if FileManager.default.fileExists(atPath: payload.path) {
            try FileManager.default.removeItem(at: payload)
        }
        try FileManager.default.removeItem(at: manifest)
    }
}
