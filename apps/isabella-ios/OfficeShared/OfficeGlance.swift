import Foundation

// What the office widget and Siri say about the day: the same three things as Heute in the office
// web app. Read with the person's own access token, so RLS decides; nothing is written.
// - Heute: my open tasks due today or running today. A task with responsibles is theirs only;
//   without responsibles it belongs to whoever created it (app/sync.js, Gari 23.11.2026).
// - Fristen: the milestones of the not archived Terminpläne of the active projects whose team I am in
//   (app/office-fristen.js), from today on.
// - Zu bestätigen: proposals of the Akte, counted like the Bandeja (deadline and decision; a
//   commitment only as «aufgabe», an open question only as «widerspruch»).
// Compiled into the app (Siri, refresh) and the widget (it only reads the stored snapshot).

struct OfficeGlance: Codable {
    struct Item: Codable, Hashable {
        let title: String
        let project: String?
        let date: String
    }
    let today: [Item]
    let todayCount: Int
    let deadlines: [Item]
    let toConfirm: Int
    let updatedAt: Date
}

enum OfficeGlanceStore {
    private static let key = "office.glance.v1"
    private static var defaults: UserDefaults? { OfficeShareConfig.group.flatMap { UserDefaults(suiteName: $0) } }

    static func save(_ glance: OfficeGlance) {
        if let data = try? JSONEncoder().encode(glance) { defaults?.set(data, forKey: key) }
    }

    // A day-old snapshot says nothing about today.
    static func load() -> OfficeGlance? {
        guard let data = defaults?.data(forKey: key),
              let glance = try? JSONDecoder().decode(OfficeGlance.self, from: data),
              Calendar.current.isDateInToday(glance.updatedAt) else { return nil }
        return glance
    }

    static func clear() { defaults?.removeObject(forKey: key) }
}

struct OfficeGlanceLoader {
    let access: OfficeShareAccess

    static func day(_ date: Date) -> String {
        let format = DateFormatter()
        format.calendar = Calendar(identifier: .gregorian)
        format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = .current
        format.dateFormat = "yyyy-MM-dd"
        return format.string(from: date)
    }

    private func get(_ path: String, _ query: [URLQueryItem]) async throws -> [[String: Any]] {
        let key = OfficeShareConfig.key
        guard let root = OfficeShareConfig.url, !key.isEmpty,
              var components = URLComponents(url: root.appending(path: path), resolvingAgainstBaseURL: false)
        else { throw OfficeShareError.notConfigured }
        components.queryItems = query
        guard let url = components.url else { throw OfficeShareError.invalidResponse }
        var req = URLRequest(url: url)
        req.timeoutInterval = 30
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + access.accessToken, forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw OfficeShareError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw OfficeShareError.http(http.statusCode) }
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw OfficeShareError.invalidResponse
        }
        return rows
    }

    func load(now: Date = Date()) async throws -> OfficeGlance {
        let me = access.userID
        let today = Self.day(now)
        // The active projects of my team, with their names.
        let team = try await get("rest/v1/office_project_members", [
            URLQueryItem(name: "select", value: "project_id,office_projects(name,status)"),
            URLQueryItem(name: "user_id", value: "eq." + me)])
        var projects: [String: String] = [:]
        for row in team {
            guard let id = (row["project_id"] as? String)?.lowercased(),
                  let project = row["office_projects"] as? [String: Any],
                  project["status"] as? String == "aktiv" else { continue }
            projects[id] = project["name"] as? String ?? ""
        }

        // Heute: own, assigned or linked open tasks of today; then the rule of who they belong to.
        let links = try await get("rest/v1/minds_work_task_assignees", [
            URLQueryItem(name: "select", value: "task_id"),
            URLQueryItem(name: "person_id", value: "eq." + me)])
        let linked = Set(links.compactMap { ($0["task_id"] as? String)?.lowercased() })
        var whose = "user_id.eq.\(me),assignee_person_id.eq.\(me)"
        if !linked.isEmpty { whose += ",id.in.(" + linked.sorted().joined(separator: ",") + ")" }
        let tasks = try await get("rest/v1/isabella_tasks", [
            URLQueryItem(name: "select", value: "id,title,user_id,assignee_person_id,project_id,due_date,start_date"),
            URLQueryItem(name: "and", value: "(or(\(whose)),or(due_date.eq.\(today),and(start_date.lte.\(today),due_date.gt.\(today))))"),
            URLQueryItem(name: "completed_at", value: "is.null"),
            URLQueryItem(name: "archived_at", value: "is.null"),
            URLQueryItem(name: "order", value: "due_date.asc"),
            URLQueryItem(name: "limit", value: "200")])
        let ids = tasks.compactMap { ($0["id"] as? String)?.lowercased() }
        var assigned: [String: Set<String>] = [:]
        if !ids.isEmpty {
            for row in try await get("rest/v1/minds_work_task_assignees", [
                URLQueryItem(name: "select", value: "task_id,person_id"),
                URLQueryItem(name: "task_id", value: "in.(" + ids.joined(separator: ",") + ")")]) {
                if let task = (row["task_id"] as? String)?.lowercased(), let person = (row["person_id"] as? String)?.lowercased() {
                    assigned[task, default: []].insert(person)
                }
            }
        }
        let mine = tasks.filter { task in
            guard let id = (task["id"] as? String)?.lowercased() else { return false }
            // As app/sync.js: the linked responsibles; without links, the task's own responsible.
            var people = assigned[id] ?? []
            if people.isEmpty, let primary = (task["assignee_person_id"] as? String)?.lowercased() { people = [primary] }
            if !people.isEmpty || linked.contains(id) { return people.contains(me) || linked.contains(id) }
            return (task["user_id"] as? String)?.lowercased() == me
        }
        let todayItems = mine.map { task in
            OfficeGlance.Item(title: task["title"] as? String ?? "",
                              project: (task["project_id"] as? String).flatMap { projects[$0.lowercased()] },
                              date: today)
        }

        // Fristen: milestones from today on, the next three.
        var deadlines: [OfficeGlance.Item] = []
        if !projects.isEmpty {
            let plans = try await get("rest/v1/office_terminplan_instances", [
                URLQueryItem(name: "select", value: "project_id,state"),
                URLQueryItem(name: "is_archived", value: "eq.false"),
                URLQueryItem(name: "project_id", value: "in.(" + projects.keys.sorted().joined(separator: ",") + ")"),
                URLQueryItem(name: "limit", value: "200")])
            for plan in plans {
                let name = (plan["project_id"] as? String).flatMap { projects[$0.lowercased()] }
                let steps = (plan["state"] as? [String: Any])?["tasks"] as? [[String: Any]] ?? []
                for step in steps where step["type"] as? String == "milestone" {
                    guard let start = step["start"] as? String, start.count >= 10 else { continue }
                    let day = String(start.prefix(10))
                    guard day >= today else { continue }
                    deadlines.append(.init(title: step["name"] as? String ?? "Meilenstein", project: name, date: day))
                }
            }
            deadlines.sort { $0.date == $1.date ? $0.title < $1.title : $0.date < $1.date }
        }

        // Zu bestätigen, as the Bandeja counts.
        let proposals = try await get("rest/v1/minds_work_memory", [
            URLQueryItem(name: "select", value: "memory_type,metadata"),
            URLQueryItem(name: "status", value: "eq.proposed"),
            URLQueryItem(name: "memory_type", value: "in.(deadline,decision,commitment,open_question)"),
            URLQueryItem(name: "limit", value: "200")])
        let toConfirm = proposals.filter { row in
            let kind = (row["metadata"] as? [String: Any])?["kind"] as? String
            switch row["memory_type"] as? String {
            case "deadline", "decision": return true
            case "commitment": return kind == "aufgabe"
            case "open_question": return kind == "widerspruch"
            default: return false
            }
        }.count

        return OfficeGlance(today: Array(todayItems.prefix(5)), todayCount: todayItems.count,
                            deadlines: Array(deadlines.prefix(3)), toConfirm: toConfirm, updatedAt: now)
    }
}
