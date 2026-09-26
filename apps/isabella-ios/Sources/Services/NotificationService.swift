import Foundation
import UserNotifications

actor NotificationService {
    func requestAuthorization() async throws -> Bool {
        try await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }

    func scheduleLocalReminder(
        id: String,
        title: String,
        body: String,
        dateComponents: DateComponents
    ) async throws {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let trigger = UNCalendarNotificationTrigger(
            dateMatching: dateComponents,
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: id,
            content: content,
            trigger: trigger
        )

        try await UNUserNotificationCenter.current().add(request)
    }
}
