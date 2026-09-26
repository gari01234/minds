import SwiftUI

struct FeedView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Feed",
                systemImage: "rectangle.stack",
                description: Text("La siguiente capa conectará el Feed curado de MINDS al mismo backend que ya usa la web.")
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
