import UIKit
import UserNotifications

// Romy's notifications (TBA Office, 27.11.2026): iOS hands the app this iPhone's APNs token, and a tap on one of
// Romy's notifications opens Romy's chat in the office account. The app model registers the token with the office
// (only while the office account is signed in). Before the model is wired up (a tap that launches the app), the
// token and the tap wait here.
@MainActor
final class WindowAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var onDeviceToken: (@MainActor (Data) -> Void)?
    static var onOpenOffice: (@MainActor () -> Void)?
    private static var pendingToken: Data?
    private static var pendingOpen = false

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if let handler = Self.onDeviceToken { handler(deviceToken) } else { Self.pendingToken = deviceToken }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No notifications this time; the app asks APNs again when it comes back.
    }

    static func takePendingToken() -> Data? {
        defer { pendingToken = nil }
        return pendingToken
    }

    static func takePendingOpen() -> Bool {
        defer { pendingOpen = false }
        return pendingOpen
    }

    // Shown while the app is open as well, like in any other app (also the personal reminders).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    // Romy's notifications carry "o": 1 (office-push); everything else opens the app as before.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let office = (response.notification.request.content.userInfo["o"] as? NSNumber)?.intValue == 1
        completionHandler()
        guard office else { return }
        Task { @MainActor in
            if let open = Self.onOpenOffice { open() } else { Self.pendingOpen = true }
        }
    }
}

// The registration as the office stores it: this iPhone's install id, its APNs token (hex), the APNs environment of
// this build, the app, this iPhone's key and the build. Once a day, or right away when one of them changed.
enum OfficePushRegistration {
    private static let deviceKey = "window.office.push.device"
    private static let stampKey = "window.office.push.stamp"
    private static let stampDateKey = "window.office.push.stamp.at"

    static var environment: String {
        #if DEBUG
        return "development"
        #else
        return "production"
        #endif
    }

    static var deviceID: String {
        if let id = UserDefaults.standard.string(forKey: deviceKey), id.count >= 8 { return id }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: deviceKey)
        return id
    }

    static var appVersion: String {
        let info = Bundle.main.infoDictionary ?? [:]
        return "\(info["CFBundleShortVersionString"] as? String ?? "?") (\(info["CFBundleVersion"] as? String ?? "?"))"
    }

    static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    static func stamp(token: String, key: String, user: String) -> String {
        [token, key, user, appVersion, environment].joined(separator: "|")
    }

    static func isCurrent(_ stamp: String) -> Bool {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: stampKey) == stamp,
              let at = defaults.object(forKey: stampDateKey) as? Date else { return false }
        return Date().timeIntervalSince(at) < 86_400
    }

    static func remember(_ stamp: String) {
        UserDefaults.standard.set(stamp, forKey: stampKey)
        UserDefaults.standard.set(Date(), forKey: stampDateKey)
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: stampKey)
        UserDefaults.standard.removeObject(forKey: stampDateKey)
    }
}
