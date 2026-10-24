import Foundation
import UserNotifications

// Local notifications require a device opt-in, not Apple Developer APNs.
// Only reminders owned by this client (identified by prefix) are reconciled.
actor NotificationService {
    private let prefix = "minds.native.task."

    func requestAuthorization() async throws -> Bool {
        try await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }

    func removeTaskReminders() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let owned = pending.map(\.identifier).filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: owned)
    }

    func syncTaskReminders(_ tasks: [AgendaTask]) async throws -> Int {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard [.authorized, .provisional].contains(settings.authorizationStatus) else {
            throw BackendError.rejected("Activa las notificaciones de Isabella en Ajustes de iOS.")
        }
        let now = Date()
        // Filter first, then choose the 50 earliest real reminders. Undated tasks
        // and completed tasks must never consume the iOS pending-notification cap.
        let candidates: [(task: AgendaTask, date: Date, components: DateComponents)] =
            tasks.compactMap { task in
                guard task.completedAt == nil,
                      let dayString = task.dueDate,
                      let timeString = task.reminderTime else { return nil }
                let day = dayString.split(separator: "-").compactMap { Int($0) }
                let clock = timeString.split(separator: ":").compactMap { Int($0) }
                guard day.count == 3, clock.count >= 2,
                      (1...12).contains(day[1]), (1...31).contains(day[2]),
                      (0...23).contains(clock[0]), (0...59).contains(clock[1]) else {
                    return nil
                }
                var when = DateComponents()
                when.timeZone = TimeZone.current
                when.year = day[0]
                when.month = day[1]
                when.day = day[2]
                when.hour = clock[0]
                when.minute = clock[1]
                guard let fire = Calendar.current.date(from: when), fire > now else {
                    return nil
                }
                let roundtrip = Calendar.current.dateComponents([.year, .month, .day], from: fire)
                guard roundtrip.year == day[0], roundtrip.month == day[1],
                      roundtrip.day == day[2] else { return nil }
                return (task: task, date: fire, components: when)
            }
            .sorted { $0.date < $1.date }

        await removeTaskReminders()
        var count = 0
        for candidate in candidates.prefix(50) {
            let content = UNMutableNotificationContent()
            content.title = "Isabella · Recordatorio"
            content.body = candidate.task.title
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(
                dateMatching: candidate.components, repeats: false
            )
            let notification = UNNotificationRequest(
                identifier: prefix + candidate.task.id.uuidString,
                content: content,
                trigger: trigger
            )
            try await center.add(notification)
            count += 1
        }
        return count
    }
}
