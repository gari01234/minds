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

// One row of the day's task list (web: dashboard-model tasksForDay).
struct DayTask: Identifiable, Hashable {
    let id: String
    let clientKey: String?
    let title: String
    let done: Bool
    let isSpan: Bool
    let until: String?
    let sortOrder: Double
    let projectName: String?
    let categoryName: String?

    init?(json: [String: Any], today: String, projects: [String: String], categories: [String: String]) {
        guard let id = json["id"] as? String, let title = json["title"] as? String else { return nil }
        self.id = id
        clientKey = json["client_key"] as? String
        self.title = title
        done = !((json["completed_at"] as? String) ?? "").isEmpty
        let due = json["due_date"] as? String
        isSpan = due != today
        until = isSpan ? due.flatMap(DayTask.shortDay) : nil
        sortOrder = (json["sort_order"] as? NSNumber)?.doubleValue ?? 0
        projectName = (json["project_id"] as? String).flatMap { projects[$0] }
        categoryName = (json["category_id"] as? String).flatMap { categories[$0] }
    }

    // "11 nov", as the web app writes it.
    static func shortDay(_ raw: String) -> String? {
        guard let date = AkteEntry.parseDay(raw) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_ES")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    var subtitle: String {
        var parts = [categoryName, projectName].compactMap { $0 }
        if let until { parts.append("en curso hasta " + until) }
        return parts.joined(separator: " · ")
    }
}
