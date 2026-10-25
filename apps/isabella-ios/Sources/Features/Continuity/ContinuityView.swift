import SwiftUI

// A human surface over owner-scoped canonical records, not a second agent.
// Intentionally no generated summaries, autonomous approvals or lock-screen data.
struct ContinuityView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 14) {
                        OrbView()
                            .frame(width: 68, height: 68)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Isabella")
                                .font(.system(size: 30, weight: .light))
                            Text("Continuidad de MINDS")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)

                    Button {
                        model.section = .chat
                    } label: {
                        Label("Preguntar a Isabella", systemImage: "text.bubble")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.borderedProminent)

                    if let issue = model.continuityError {
                        Text("No se pudo verificar la continuidad: " + issue)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else if model.continuityItems.isEmpty {
                        ContentUnavailableView(
                            "Sin estados activos recuperados",
                            systemImage: "checkmark.circle",
                            description: Text("Esto no garantiza que no haya otras tareas. La agenda y los documentos permanecen en MINDS.")
                        )
                    } else {
                        ForEach(model.continuityItems) { item in
                            VStack(alignment: .leading, spacing: 9) {
                                Text(item.heading)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(item.title)
                                    .font(.headline)
                                Text(item.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                if item.kind == .review {
                                    Button("Abrir conversación para revisar") {
                                        model.section = .chat
                                    }
                                    .font(.subheadline)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
                            .accessibilityIdentifier("continuity-" + item.kind.rawValue)
                        }
                    }
                }
                .padding(20)
            }
            .refreshable { await model.reloadContinuity() }
            .navigationTitle("Continuidad")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Actualizar", systemImage: "arrow.clockwise") {
                        Task { await model.reloadContinuity() }
                    }
                }
            }
        }
    }
}
