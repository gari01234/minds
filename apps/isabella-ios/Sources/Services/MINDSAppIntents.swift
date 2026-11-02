import AppIntents
import Foundation

struct OpenIsabellaIntent: AppIntent {
    static var title: LocalizedStringResource = "Abrir Isabella"
    static var description = IntentDescription("Abre la conversación personal de Isabella.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult { .result() }
}

// Read only. Siri has no authority to change Window.
// The same tasks as Ahora's «Hoy»: due today, plus open tasks whose start–due window spans today.
struct TodayMINDSIntent: AppIntent {
    static var title: LocalizedStringResource = "Mis tareas de hoy en Window"
    static var description = IntentDescription("Consulta tus tareas de hoy en Window sin modificar nada.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let pending = try await BackendClient().dayTasks().filter { !$0.done }
        if pending.isEmpty {
            return .result(dialog: "Hoy no tienes tareas pendientes en Window.")
        }
        let names = pending.prefix(3).map(\.title).joined(separator: ", ")
        let count = pending.count == 1 ? "una tarea" : "\(pending.count) tareas"
        return .result(dialog: IntentDialog("Hoy tienes \(count): \(names)\(pending.count > 3 ? " y más." : ".")"))
    }
}

// Fetches the next real Window event, without requesting Calendar.app permissions.
struct NextMINDSCalendarEventIntent: AppIntent {
    static var title: LocalizedStringResource = "Próximo evento en Window"
    static var description = IntentDescription("Consulta el siguiente evento de tu agenda privada.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let events = try await BackendClient().events()
        guard let next = events.first(where: { ($0.startDate ?? .distantPast) > Date() }),
              let start = next.startDate else {
            return .result(dialog: "No veo eventos próximos en Window.")
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
                "Qué tengo hoy en \(.applicationName)",
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
