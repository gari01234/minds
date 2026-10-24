import AppIntents
import Foundation

struct OpenIsabellaIntent: AppIntent {
    static var title: LocalizedStringResource = "Abrir Isabella"
    static var description = IntentDescription("Abre la conversación personal de Isabella.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

// Read only. Siri has no authority to mutate MINDS.
struct TodayMINDSIntent: AppIntent {
    static var title: LocalizedStringResource = "Mis tareas de hoy en MINDS"
    static var description = IntentDescription("Consulta la agenda de MINDS sin modificar nada.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let tasks = try await BackendClient().todayTasks()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let pending = tasks.filter { $0.dueDate == today && $0.completedAt == nil }
        if pending.isEmpty {
            return .result(dialog: "No hay tareas pendientes para hoy en MINDS.")
        }
        let names = pending.prefix(3).map(\.title).joined(separator: ", ")
        return .result(dialog: IntentDialog("Tienes \(pending.count) tareas pendientes hoy. \(names)"))
    }
}

// Fetches the next real MINDS event, without requesting Calendar.app permissions.
struct NextMINDSCalendarEventIntent: AppIntent {
    static var title: LocalizedStringResource = "Próximo evento de MINDS"
    static var description = IntentDescription("Consulta el siguiente evento de tu agenda privada.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let events = try await BackendClient().events()
        guard let next = events.first(where: { ($0.startDate ?? .distantPast) > Date() }),
              let start = next.startDate else {
            return .result(dialog: "No veo eventos próximos en MINDS.")
        }
        let date = start.formatted(date: .abbreviated, time: next.allDay ? .omitted : .shortened)
        return .result(dialog: IntentDialog("Tu próximo evento es \(next.title), \(date)."))
    }
}

struct MINDSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenIsabellaIntent(),
            phrases: [
                "Abrir Isabella en \(.applicationName)",
                "Hablar con Isabella en \(.applicationName)"
            ],
            shortTitle: "Abrir Isabella",
            systemImageName: "message"
        )
        AppShortcut(
            intent: TodayMINDSIntent(),
            phrases: [
                "Mis tareas de hoy en \(.applicationName)",
                "Consultar mi agenda en \(.applicationName)"
            ],
            shortTitle: "Tareas de hoy",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: NextMINDSCalendarEventIntent(),
            phrases: [
                "Próximo evento en \(.applicationName)",
                "Consultar próximo evento en \(.applicationName)"
            ],
            shortTitle: "Próximo evento",
            systemImageName: "calendar.badge.clock"
        )
    }
}
