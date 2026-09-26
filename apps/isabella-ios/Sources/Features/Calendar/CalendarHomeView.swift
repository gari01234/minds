import SwiftUI

struct CalendarHomeView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Calendario",
                systemImage: "calendar",
                description: Text("La agenda nativa se conectará a las tareas, eventos y rutinas que ya viven en Supabase.")
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("MINDS")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(4)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
