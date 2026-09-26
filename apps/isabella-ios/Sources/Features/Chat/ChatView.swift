import SwiftUI

struct ChatView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        if model.messages.isEmpty {
                            VStack(spacing: 34) {
                                OrbView(thinking: model.isThinking)
                                    .padding(.top, 70)

                                TodayStrip()
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 30)
                        } else {
                            TodayStrip()
                                .padding(.bottom, 8)

                            ForEach(model.messages) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 118)
                }
                .onChange(of: model.messages.count) {
                    guard let id = model.messages.last?.id else { return }
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(id, anchor: .bottom)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                ComposerView(text: $model.composerText) {
                    Task { await model.sendCurrentMessage() }
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
                .padding(.bottom, 6)
                .background(.ultraThinMaterial)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("MINDS")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(4)
                        .foregroundStyle(.secondary)
                }

                ToolbarItem(placement: .principal) {
                    if !model.messages.isEmpty {
                        Button {
                            // La pulsación abrirá Focus/voz en la siguiente fase.
                        } label: {
                            OrbView(compact: true, thinking: model.isThinking)
                        }
                        .buttonStyle(.plain)
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Rutinas") {}
                        Button("Memoria") {}
                        Button("Ajustes") {}
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.headline)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct TodayStrip: View {
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            Text("Hoy")
                .font(.system(size: 34, weight: .regular, design: .serif))

            VStack(alignment: .leading, spacing: 4) {
                Text("Agenda de hoy")
                    .font(.system(size: 16, weight: .medium))
                Text("Se conectará a tus eventos y tareas de MINDS")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 8)
    }
}
