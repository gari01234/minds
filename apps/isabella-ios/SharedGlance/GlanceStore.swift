import Foundation

struct ContinuityGlance: Codable {
    let reviews: Int
    let attention: Int
    let activeCommitments: Int
    let updatedAt: Date
}

enum GlanceStore {
    private static let key = "minds.continuity.glance.v1"

    private static func defaults() -> UserDefaults? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "MINDSAppGroupID") as? String,
              group.hasPrefix("group.") else { return nil }
        return UserDefaults(suiteName: group)
    }

    static func save(_ items: [ContinuityItem]) {
        guard let defaults = defaults() else { return }
        let glance = ContinuityGlance(
            reviews: items.filter { $0.kind == .review }.count,
            attention: items.filter { $0.kind == .attention }.count,
            activeCommitments: items.filter { $0.kind == .commitment }.count,
            updatedAt: Date()
        )
        if let data = try? JSONEncoder().encode(glance) {
            defaults.set(data, forKey: key)
        }
    }

    static func load() -> ContinuityGlance? {
        guard let data = defaults()?.data(forKey: key),
              let glance = try? JSONDecoder().decode(ContinuityGlance.self, from: data),
              // Never display old attention counts as current.
              Date().timeIntervalSince(glance.updatedAt) >= 0,
              Date().timeIntervalSince(glance.updatedAt) < 4 * 60 * 60
        else { return nil }
        return glance
    }

    static func clear() {
        defaults()?.removeObject(forKey: key)
    }
}
