import SwiftUI
import UIKit

// Chat · Ahora · Tiempo · Work · Bandeja. Every tab shows the one shared web page
// (it moves to the active tab and keeps its state), so the iPhone and the desktop
// show the same Ahora and the same Bandeja. Lecturas and Thoughts open from the
// page's own "•••" menu. Icons only, drawn like the web app's navigation
// (Assets.xcassets: Chat, Ahora, Tiempo, Work, Bandeja); the image name doubles
// as the accessibility label.
struct MainTabView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    // Like the web app's navigation: the active icon in ink, the others in soft gray.
    init() {
        UITabBar.appearance().unselectedItemTintColor = UIColor(red: 0.376, green: 0.388, blue: 0.416, alpha: 1)
    }

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            if model.account == .office {
                // TBA Office: Romy · Heute · Kalender · Work · Tools (same icons as the office web).
                page(.chat, "Chat")
                page(.ahora, "Ahora")
                page(.tiempo, "Tiempo")
                page(.work, "Work")
                page(.tools, "Tools")
            } else {
                page(.chat, "Chat")
                page(.ahora, "Ahora")
                page(.tiempo, "Tiempo")
                page(.work, "Work")
                page(.bandeja, "Bandeja")
                    .badge(model.openProposals)
            }
        }
        // Each account has its own web page: rebuild the tabs when the account changes.
        .id(model.account)
        .tint(Color(red: 0.090, green: 0.090, blue: 0.090))
        .onChange(of: model.tab) { _, _ in model.showWebSection() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshBadge() } }
        }
    }

    private func page(_ tab: AppModel.Tab, _ icon: String) -> some View {
        WebTabView(session: model.activePortal, active: model.tab == tab)
            // Under the status bar (the page handles it), but above the tab bar.
            .ignoresSafeArea(edges: .top)
            .tabItem { Image(icon) }
            .tag(tab)
    }
}
