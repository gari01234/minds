import SwiftUI

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 52) }

            Text(message.text)
                .font(.system(size: 18))
                .lineSpacing(3)
                .textSelection(.enabled)
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color(uiColor: message.role == .user ? .systemGray6 : .secondarySystemBackground))
                )
                .contextMenu {
                    Section {
                        reaction("❤️")
                        reaction("👍")
                        reaction("😂")
                        reaction("😮")
                        reaction("😢")
                        reaction("👏")
                    }

                    Button {
                        UIPasteboard.general.string = message.text
                    } label: {
                        Label("Copiar", systemImage: "doc.on.doc")
                    }
                }

            if message.role == .assistant { Spacer(minLength: 52) }
        }
    }

    @ViewBuilder
    private func reaction(_ emoji: String) -> some View {
        Button(emoji) {
            // Las reacciones persistentes se conectarán al modelo de conversación.
        }
    }
}
