import Foundation

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
        guard let date = DayTask.parseDay(raw) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_ES")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    // A calendar day ("2026-11-11"), shown as the same day locally.
    static func parseDay(_ raw: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let utc = formatter.date(from: String(raw.prefix(10))) else { return nil }
        let parts = Calendar(identifier: .gregorian).dateComponents(in: TimeZone(identifier: "UTC")!, from: utc)
        return Calendar.current.date(from: DateComponents(year: parts.year, month: parts.month, day: parts.day))
    }

    var subtitle: String {
        var parts = [categoryName, projectName].compactMap { $0 }
        if let until { parts.append("en curso hasta " + until) }
        return parts.joined(separator: " · ")
    }
}
