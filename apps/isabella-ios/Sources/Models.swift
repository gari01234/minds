import Foundation

struct ChatMessage: Identifiable, Equatable {
    enum Role: String {
        case user
        case assistant
    }

    let id: UUID
    let role: Role
    let text: String
    var reaction: String?

    init(id: UUID = UUID(), role: Role, text: String, reaction: String? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.reaction = reaction
    }
}
