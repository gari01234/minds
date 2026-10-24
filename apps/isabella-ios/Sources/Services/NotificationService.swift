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
        await removeTaskReminders()
        var count = 0
        // iOS limits pending local notifications; reserve capacity for other app reminders.
        for task in tasks.filter({
            $0.completedAt == nil && $0.dueDate != nil && $0.reminderTime != nil
        }).prefix(50) {
            guard let date = task.dueDate, let time = task.reminderTime else { continue }
            let day = date.split(separator: "-").compactMap { Int($0) }
            let hour = time.split(separator: ":").compactMap { Int($0) }
            guard day.count == 3, hour.count >= 2 else { continue }
            var when = DateComponents()
            when.timeZone = TimeZone.current
            when.year = day[0]
            when.month = day[1]
            when.day = day[2]
            when.hour = hour[0]
            when.minute = hour[1]
            guard let target = Calendar.current.date(from: when),
                  target > Date() else { continue }

            let content = UNMutableNotificationContent()
            content.title = "Isabella · Recordatorio"
            content.body = task.title
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
            let notification = UNNotificationRequest(
                identifier: prefix + task.id.uuidString,
                content: content,
                trigger: trigger
            )
            try await center.add(notification)
            count += 1
        }
        return count
    }
}
