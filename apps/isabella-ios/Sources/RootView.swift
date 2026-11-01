import SwiftUI

// Window on iPhone is the same MINDS web app Gari uses in Safari, full screen:
// one look, one sign-in (inside the web app), no second navigation bar.
// The native Continuity, Chat and Agenda views stay in the project for later
// Apple integrations, but are not shown until they match the web app.
struct RootView: View {
    var body: some View {
        FullMINDSView()
    }
}
