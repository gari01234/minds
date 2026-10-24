import SwiftUI

struct CalendarHomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                Section("Próximos eventos") {
                    if model.events.isEmpty {
                        Text("No hay eventos próximos.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(model.events) { event in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(event.title).font(.body)
                            if let date = event.startDate {
                                Text(date.formatted(date: .abbreviated,
                                                    time: event.allDay ? .omitted : .shortened))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 3)
                    }
                }

                Section("Tareas pendientes") {
                    if model.tasks.isEmpty {
                        Text("No hay tareas guardadas.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(model.tasks.filter { $0.completedAt == nil }) { task in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(task.title).font(.body)
                            Text(task.dueDate ?? "Sin fecha")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
            .refreshable { await model.reload() }
            .navigationTitle("Agenda MINDS")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Sincronizar agenda", systemImage: "arrow.clockwise") {
                            Task { await model.reload() }
                        }
                        if model.localRemindersEnabled {
                            Button("Desactivar avisos locales", systemImage: "bell.slash") {
                                Task { await model.disableLocalReminders() }
                            }
                        } else {
                            Button("Activar avisos locales", systemImage: "bell") {
                                Task { await model.enableLocalReminders() }
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .alert("Agenda MINDS", isPresented: Binding(
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
