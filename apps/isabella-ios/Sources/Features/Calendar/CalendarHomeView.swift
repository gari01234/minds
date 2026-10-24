import SwiftUI

struct CalendarHomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                if model.tasks.isEmpty {
                    ContentUnavailableView("No hay tareas", systemImage: "calendar",
                        description: Text("Desliza hacia abajo para sincronizar con Supabase."))
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
            .refreshable { await model.reload() }
            .navigationTitle("Calendario")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Actualizar", systemImage: "arrow.clockwise") {
                        Task { await model.reload() }
                    }
                }
            }
        }
    }
}
