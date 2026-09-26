import SwiftUI

struct IdeasView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Ideas",
                systemImage: "sparkles",
                description: Text("Esta superficie reutilizará las ideas generadas por MINDS sin mezclarlas con el chat personal.")
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
