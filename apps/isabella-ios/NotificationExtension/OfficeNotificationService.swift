import UserNotifications

// Romy's notifications (TBA Office): opens the sealed text on the iPhone with this iPhone's key. Without the key
// (signed out of Office, another person's notification) it shows what Apple carried: «Romy · Neue Mitteilung».
// Nothing is stored or sent from here.
final class OfficeNotificationService: UNNotificationServiceExtension {
    private var deliver: ((UNNotificationContent) -> Void)?
    private var original: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        original = request.content
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        deliver = contentHandler
        if let sealed = content.userInfo["e"] as? String, let key = OfficePushKey.load(),
           let message = OfficePushMessage.open(sealed, with: key) {
            content.title = String(message.t.prefix(80))
            content.body = String(message.b.prefix(600))
            content.threadIdentifier = "romy"
            var info = content.userInfo
            info.removeValue(forKey: "e")
            info["ziel"] = message.z ?? "romy"
            content.userInfo = info
        }
        deliver = nil
        contentHandler(content)
    }

    override func serviceExtensionTimeWillExpire() {
        if let deliver, let original { deliver(original) }
        deliver = nil
    }
}
