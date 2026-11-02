import SwiftUI
import UIKit

// Chat · Ahora · Tiempo · Work · Bandeja. Chat, Tiempo and Work show the one shared
// web page (it moves to the active tab and keeps its state); Ahora and Bandeja are native.
// Lecturas and Thoughts open from the page's own "•••" menu. Icons only, drawn like
// the web app's navigation (Assets.xcassets: Chat, Ahora, Tiempo, Work, Bandeja);
// the image name doubles as the accessibility label.
struct MainTabView: View {
    @Environment(AppModel.self) private var model

    // Like the web app's navigation: the active icon in ink, the others in soft gray.
    init() {
        UITabBar.appearance().unselectedItemTintColor = UIColor(red: 0.376, green: 0.388, blue: 0.416, alpha: 1)
    }

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            WebTabView(session: model.webPortal, active: model.tab == .chat)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Image("Chat") }
                .tag(AppModel.Tab.chat)
            AhoraView()
                .tabItem { Image("Ahora") }
                .tag(AppModel.Tab.ahora)
            WebTabView(session: model.webPortal, active: model.tab == .tiempo)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Image("Tiempo") }
                .tag(AppModel.Tab.tiempo)
            WebTabView(session: model.webPortal, active: model.tab == .work)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Image("Work") }
                .tag(AppModel.Tab.work)
            BandejaView()
                .tabItem { Image("Bandeja") }
                .badge(model.openProposals)
                .tag(AppModel.Tab.bandeja)
        }
        .tint(WindowStyle.ink)
        .onChange(of: model.tab) { _, _ in model.showWebSection() }
        .task { await model.reloadAhora() }
    }
}
