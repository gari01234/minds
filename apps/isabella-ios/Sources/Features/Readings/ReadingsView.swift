import SwiftUI

struct ReadingsView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Readings",
                systemImage: "text.book.closed",
                description: Text("Sofía seguirá siendo una superficie separada de Isabella y compartirá la misma memoria de MINDS.")
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("MINDS · READINGS")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(3)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
