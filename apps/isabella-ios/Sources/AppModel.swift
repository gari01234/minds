import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    enum Section: Hashable {
        case chat, feed, ideas, calendar, readings
    }

    var section: Section = .chat
    var messages: [ChatMessage] = []
    var isThinking = false
    var composerText = ""

    let backend = BackendClient()
    let notifications = NotificationService()

    func sendCurrentMessage() async {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        composerText = ""
        messages.append(ChatMessage(role: .user, text: text))
        isThinking = true
        defer { isThinking = false }

        do {
            let reply = try await backend.sendMessage(text)
            messages.append(ChatMessage(role: .assistant, text: reply))
        } catch {
            messages.append(
                ChatMessage(
                    role: .assistant,
                    text: "El cliente nativo todavía no tiene configurada su sesión de MINDS. La interfaz funciona; la conexión al backend se activará en la siguiente capa."
                )
            )
        }
    }
}
