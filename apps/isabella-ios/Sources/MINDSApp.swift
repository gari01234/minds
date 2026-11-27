import SwiftUI

@main
@MainActor
struct MINDSApp: App {
    // APNs token and taps on Romy's notifications (TBA Office).
    @UIApplicationDelegateAdaptor(WindowAppDelegate.self) private var appDelegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}
