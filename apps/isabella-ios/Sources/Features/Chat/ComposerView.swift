import SwiftUI

struct ComposerView: View {
    @Binding var text: String
    var send: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button {
                // Focus/voz nativo se conecta en la siguiente fase.
            } label: {
                Image(systemName: "waveform")
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial, in: Circle())
            }

            TextField("Escríbele a Isabella…", text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)

            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(.black, in: Circle())
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color(uiColor: .systemBackground))
                .stroke(Color(uiColor: .separator).opacity(0.35), lineWidth: 1)
        )
    }
}
