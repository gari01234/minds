import SwiftUI

// The web app's tokens (shared/minds-design-tokens.css), so native and web screens match.
enum WindowStyle {
    static let paper = Color(red: 0.969, green: 0.969, blue: 0.965)
    static let card = Color.white
    static let border = Color(red: 0.902, green: 0.902, blue: 0.894)
    static let ink = Color(red: 0.090, green: 0.090, blue: 0.090)
    static let soft = Color(red: 0.376, green: 0.388, blue: 0.416)
    static let faint = Color(red: 0.439, green: 0.451, blue: 0.478)
    static let information = Color(red: 0.137, green: 0.361, blue: 0.518)
    static let informationBg = Color(red: 0.933, green: 0.953, blue: 0.973)
    static let success = Color(red: 0.157, green: 0.459, blue: 0.341)
    static let successBg = Color(red: 0.933, green: 0.961, blue: 0.945)
    static let attention = Color(red: 0.573, green: 0.322, blue: 0.114)
    static let attentionBg = Color(red: 0.984, green: 0.953, blue: 0.925)
    static let error = Color(red: 0.710, green: 0.278, blue: 0.212)
    static let errorBg = Color(red: 0.973, green: 0.933, blue: 0.925)
}

extension View {
    func windowCard(padding: CGFloat = 0) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(WindowStyle.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(WindowStyle.border, lineWidth: 1))
    }

    func windowSectionTitle() -> some View {
        self
            .font(.footnote.weight(.semibold))
            .kerning(0.6)
            .foregroundStyle(WindowStyle.soft)
    }
}

struct WindowPrimaryButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 40)
                .foregroundStyle(.white)
                .background(WindowStyle.ink, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

struct WindowSecondaryButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(.subheadline)
                .frame(maxWidth: .infinity, minHeight: 40)
                .foregroundStyle(Color(red: 0.239, green: 0.251, blue: 0.275))
                .background(WindowStyle.card, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0.878, green: 0.878, blue: 0.871), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
