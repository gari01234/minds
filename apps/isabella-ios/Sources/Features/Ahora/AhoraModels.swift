import Foundation

// A Projektakte entry as the Bandeja and Ahora show it (same rows as the web Panorama).
struct AkteEntry: Identifiable, Hashable {
    enum Kind: String { case frist, entscheidung, aufgabe, widerspruch }

    let id: String
    let kind: Kind
    let title: String
    let reason: String
    let quote: String?
    let source: String?
    let topic: String?
    let date: Date?
    let projectName: String
    let projectKey: String?

    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, UUID(uuidString: id) != nil,
              let type = json["memory_type"] as? String,
              let title = json["title"] as? String, !title.isEmpty else { return nil }
        switch type {
        case "deadline": kind = .frist
        case "decision": kind = .entscheidung
        case "commitment": kind = .aufgabe
        case "open_question": kind = .widerspruch
        default: return nil
        }
        self.id = id
        self.title = title
        reason = (json["body"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let meta = json["metadata"] as? [String: Any] ?? [:]
        quote = (meta["zitat"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        source = (meta["quelle"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        topic = (meta["thema"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let day = (meta["faellig"] as? String) ?? (json["occurred_at"] as? String)
        date = day.flatMap(AkteEntry.parseDay)
        let project = json["isabella_projects"] as? [String: Any]
        projectName = project?["name"] as? String ?? "Sin proyecto"
        projectKey = project?["client_key"] as? String
    }

    static func parseDay(_ raw: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let utc = formatter.date(from: String(raw.prefix(10))) else { return nil }
        // A calendar day, shown as the same day locally.
        let parts = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(identifier: "UTC")!, from: utc)
        return Calendar.current.date(from: DateComponents(year: parts.year, month: parts.month, day: parts.day))
    }

    var kindLabel: String {
        switch kind {
        case .frist: return "FRIST"
        case .entscheidung: return "ENTSCHEIDUNG"
        case .aufgabe: return "AUFGABE"
        case .widerspruch: return "WIDERSPRUCH"
        }
    }

    // Akte content is German, so its dates are too: "Mi. 04.11."
    var dayText: String? {
        guard let date else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "EE dd.MM."
        return formatter.string(from: date)
    }

    var daysLeft: Int? {
        guard let date else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()),
                                               to: Calendar.current.startOfDay(for: date)).day
    }
}

enum AkteDecision {
    case confirm, reject, resolve, makeTask
}

// One card of Isabella's current situation (web "Situación › Ahora").
struct FeedItem: Identifiable, Hashable {
    struct Detail: Hashable {
        let label: String
        let value: String
    }

    let id: String
    let kind: String
    let title: String
    let body: String
    let why: String?
    let prompt: String?
    let details: [Detail]

    init?(json: [String: Any]) {
        let meta = json["metadata"] as? [String: Any] ?? [:]
        let text = { (key: String) -> String? in
            let value = (json[key] as? String) ?? (meta[key] as? String)
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? nil : trimmed
        }
        guard let title = text("title") else { return nil }
        id = (json["id"] as? String) ?? title
        kind = (text("kind") ?? "").lowercased()
        self.title = title
        body = text("body") ?? ""
        why = text("why")
        prompt = text("action_prompt")
        let raw = (json["details"] as? [[String: Any]]) ?? (meta["details"] as? [[String: Any]]) ?? []
        details = raw.prefix(8).compactMap { row in
            let label = (row["label"] as? String) ?? (row["day"] as? String) ?? ""
            let value = (row["value"] as? String) ?? (row["summary"] as? String) ?? ""
            return label.isEmpty && value.isEmpty ? nil : Detail(label: label, value: value)
        }
    }

    var isWeather: Bool { kind == "weather" }
}
