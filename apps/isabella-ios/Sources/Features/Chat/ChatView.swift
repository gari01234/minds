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
                            TodayStrip().padding(.bottom, 8)
                            ForEach(model.messages) { message in
                                MessageBubble(message: message).id(message.id)
                            }
                            if let proposal = model.pendingReview {
                                Button("Revisar propuesta pendiente") {
                                    model.pendingReview = proposal
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 118)
                }
                .refreshable { await model.reload() }
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
                .disabled(model.isThinking || model.pendingReview != nil)
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
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Actualizar conversación") {
                            Task { await model.reload() }
                        }
                        Button("Cerrar sesión", role: .destructive) {
                            Task { await model.logout() }
                        }
                    } label: {
                        Image(systemName: "ellipsis").font(.headline)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $model.pendingReview) { proposal in
                NativeReviewSheet(proposal: proposal)
            }
            .alert("MINDS", isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.errorMessage = nil } }
            )) {
                Button("Aceptar") { model.errorMessage = nil }
            } message: {
                Text(model.errorMessage ?? "")
            }
        }
    }
}

private struct NativeReviewSheet: View {
    @Environment(AppModel.self) private var model
    let proposal: NativeReviewProposal

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Revisar propuesta").font(.title2.bold())
            Text(proposal.title).font(.headline)
            Text(proposal.action == "create" ? "Crear tarea" : "Actualizar tarea")
                .foregroundStyle(.secondary)
            if let date = proposal.date {
                Text("Fecha propuesta: " + date).font(.subheadline)
            }
            Text("Isabella necesita tu confirmación. Supabase verificará el recibo y el resultado.")
                .font(.footnote).foregroundStyle(.secondary)
            if model.isReviewing { ProgressView() }
            if proposal.reviewable {
                Button("Confirmar") {
                    Task { await model.resolveReview(approve: true) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isReviewing)
                Button("Cancelar propuesta", role: .destructive) {
                    Task { await model.resolveReview(approve: false) }
                }
                .disabled(model.isReviewing)
            } else {
                Text("Esta acción todavía requiere revisión en la PWA. No se ha aplicado ningún cambio.")
                    .foregroundStyle(.secondary)
                Button("Cerrar") { model.pendingReview = nil }
            }
            Spacer()
        }
        .padding(30)
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(model.isReviewing)
    }
}

private struct TodayStrip: View {
    @Environment(AppModel.self) private var model

    private var today: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private var todayEventCount: Int {
        model.events.filter {
            guard let date = $0.startDate else { return false }
            return Calendar.current.isDate(date, inSameDayAs: Date())
        }.count
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            Text("Hoy")
                .font(.system(size: 34, weight: .regular, design: .serif))
            VStack(alignment: .leading, spacing: 4) {
                Text("Agenda de hoy")
                    .font(.system(size: 16, weight: .medium))
                Text(String(model.tasks.filter {
                    $0.dueDate == today && $0.completedAt == nil
                }.count) + " tareas · " + String(todayEventCount) + " eventos")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(.vertical, 8)
    }
}
