import CryptoKit
import Foundation
import Security

// Romy's notifications (TBA Office, 27.11.2026). Apple only carries «Romy · Neue Mitteilung» and the text sealed with
// this iPhone's own key: the app creates the key once and gives it only to the office (office_push_geraete); the
// notification extension reads it from the shared Keychain group and opens the text on the iPhone. Signing out of
// Office deletes the key, so nothing sealed for that person can be opened here any more.
enum OfficePushKey {
    static let service = "tba.office.push.key"
    private static let account = "office"

    // "<Team ID>.<bundle>.push" from the target's Info.plist; nil where the build has no team (simulator, CI preview).
    static var group: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MINDSKeychainGroup") as? String,
              value.hasSuffix(".push"), !value.hasPrefix("."), !value.contains("$(") else { return nil }
        return value
    }

    private static func query(_ group: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrAccessGroup as String: group]
    }

    static func load() -> SymmetricKey? {
        guard let group else { return nil }
        var q = query(group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data, data.count == 32 else { return nil }
        return SymmetricKey(data: data)
    }

    // The app only: one key per install. Readable after the first unlock (notifications arrive while the iPhone is
    // locked), on this device only, never in a backup.
    static func loadOrCreate() -> SymmetricKey? {
        if let key = load() { return key }
        guard let group else { return nil }
        let key = SymmetricKey(size: .bits256)
        var q = query(group)
        q[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecDuplicateItem { return load() }
        return status == errSecSuccess ? key : nil
    }

    static func delete() {
        guard let group else { return }
        SecItemDelete(query(group) as CFDictionary)
    }

    static func base64(_ key: SymmetricKey) -> String {
        key.withUnsafeBytes { Data($0).base64EncodedString() }
    }

    // A short fingerprint, so the app notices a new key without keeping the key anywhere else.
    static func fingerprint(_ key: SymmetricKey) -> String {
        let digest = key.withUnsafeBytes { SHA256.hash(data: Data($0)) }
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }
}

// What the office sealed: title, text, where a tap leads, kind and id (office-push, core.mjs `inhalt`).
struct OfficePushMessage: Decodable {
    let t: String
    let b: String
    let z: String?
    let k: String?
    let i: String?

    // Nonce (12 bytes) ‖ ciphertext ‖ tag (16 bytes), Base64: AES-GCM as CryptoKit calls it «combined».
    static func open(_ sealed: String, with key: SymmetricKey) -> OfficePushMessage? {
        guard let data = Data(base64Encoded: sealed), data.count > 28,
              let box = try? AES.GCM.SealedBox(combined: data),
              let plain = try? AES.GCM.open(box, using: key) else { return nil }
        return try? JSONDecoder().decode(OfficePushMessage.self, from: plain)
    }
}
