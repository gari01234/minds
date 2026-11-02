import SwiftUI

// Chat · Ahora · Tiempo · Work · Bandeja. Chat, Tiempo and Work show the one shared
// web page (it moves to the active tab and keeps its state); Ahora and Bandeja are native.
// Lecturas and Thoughts open from the page's own "•••" menu.
struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            WebTabView(session: model.webPortal, active: model.tab == .chat)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Label("Chat", systemImage: "bubble.left") }
                .tag(AppModel.Tab.chat)
            AhoraView()
                .tabItem { Label("Ahora", systemImage: "smallcircle.filled.circle") }
                .tag(AppModel.Tab.ahora)
            WebTabView(session: model.webPortal, active: model.tab == .tiempo)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Label("Tiempo", systemImage: "calendar") }
                .tag(AppModel.Tab.tiempo)
            WebTabView(session: model.webPortal, active: model.tab == .work)
                // Under the status bar (the page handles it), but above the tab bar.
                .ignoresSafeArea(edges: .top)
                .tabItem { Label("Work", systemImage: "folder") }
                .tag(AppModel.Tab.work)
            BandejaView()
                .tabItem { Label("Bandeja", systemImage: "tray") }
                .badge(model.openProposals)
                .tag(AppModel.Tab.bandeja)
        }
        .tint(WindowStyle.ink)
        .onChange(of: model.tab) { _, _ in model.showWebSection() }
        .task { await model.reloadAhora() }
    }
}
