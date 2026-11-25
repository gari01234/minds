import AppIntents
import Foundation
import WidgetKit

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

// Office (Gari, 25.11.2026: he uses Office far more). Read only, with his own office session: the
// token from the shared Keychain while it is valid, otherwise the app's session refreshes it (Siri
// runs these intents in the app's process). The answer also refreshes the office widget.
private func officeGlance() async throws -> OfficeGlance? {
    let access: OfficeShareAccess?
    if let current = OfficeShareKeychain.access() { access = current }
    else { access = try await OfficeSession().shareAccess() }
    guard let access else { return nil }
    let glance = try await OfficeGlanceLoader(access: access).load()
    OfficeGlanceStore.save(glance)
    WidgetCenter.shared.reloadTimelines(ofKind: "WindowOffice")
    return glance
}

struct OfficeTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Mis tareas de hoy en la oficina"
    static var description = IntentDescription("Consulta tus tareas de hoy en TBA Office sin modificar nada.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let glance = try await officeGlance() else {
            return .result(dialog: "No has entrado a Office en Window.")
        }
        if glance.todayCount == 0 {
            return .result(dialog: "Hoy no tienes tareas pendientes en la oficina.")
        }
        let names = glance.today.prefix(3).map(\.title).joined(separator: ", ")
        let count = glance.todayCount == 1 ? "una tarea" : "\(glance.todayCount) tareas"
        return .result(dialog: IntentDialog("Hoy tienes \(count) en la oficina: \(names)\(glance.todayCount > 3 ? " y más." : ".")"))
    }
}

struct OfficeNextDeadlineIntent: AppIntent {
    static var title: LocalizedStringResource = "Próxima Frist de la oficina"
    static var description = IntentDescription("Consulta el próximo hito de los Terminpläne de tus proyectos.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let glance = try await officeGlance() else {
            return .result(dialog: "No has entrado a Office en Window.")
        }
        guard let next = glance.deadlines.first else {
            return .result(dialog: "No veo Fristen próximas en tus proyectos.")
        }
        let parts = next.date.split(separator: "-")
        let day = parts.count == 3 ? "\(parts[2]).\(parts[1])." : next.date
        let project = next.project.map { " de \($0)" } ?? ""
        return .result(dialog: IntentDialog("La próxima Frist es \(next.title)\(project), el \(day)"))
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
            intent: OfficeTodayIntent(),
            phrases: [
                "Qué tengo hoy en la oficina en \(.applicationName)",
                "Mis tareas de la oficina en \(.applicationName)"
            ],
            shortTitle: "Oficina: hoy",
            systemImageName: "building.2"
        )
        AppShortcut(
            intent: OfficeNextDeadlineIntent(),
            phrases: [
                "Próxima Frist en \(.applicationName)",
                "Próximo plazo de la oficina en \(.applicationName)"
            ],
            shortTitle: "Próxima Frist",
            systemImageName: "flag"
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
