import SwiftUI

struct OrbView: View {
    var compact = false
    var thinking = false

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            .white.opacity(0.95),
                            Color(red: 0.96, green: 0.76, blue: 0.70).opacity(0.52),
                            Color(red: 0.77, green: 0.71, blue: 0.92).opacity(0.34),
                            .clear
                        ],
                        center: .center,
                        startRadius: 2,
                        endRadius: compact ? 28 : 80
                    )
                )
                .blur(radius: compact ? 5 : 12)

            Circle()
                .fill(.white.opacity(0.18))
                .blur(radius: compact ? 8 : 18)
        }
        .frame(width: compact ? 42 : 170, height: compact ? 42 : 170)
        .scaleEffect(thinking ? 1.05 : 1)
        .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: thinking)
        .accessibilityLabel(thinking ? "Isabella está pensando" : "Isabella")
    }
}
