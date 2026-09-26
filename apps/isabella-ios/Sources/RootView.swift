import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        TabView(selection: $model.section) {
            ChatView()
                .tabItem { Label("Chat", systemImage: "circle") }
                .tag(AppModel.Section.chat)

            FeedView()
                .tabItem { Label("Feed", systemImage: "rectangle.stack") }
                .tag(AppModel.Section.feed)

            IdeasView()
                .tabItem { Label("Ideas", systemImage: "circle.dotted") }
                .tag(AppModel.Section.ideas)

            CalendarHomeView()
                .tabItem { Label("Calendario", systemImage: "calendar") }
                .tag(AppModel.Section.calendar)

            ReadingsView()
                .tabItem { Label("Readings", systemImage: "text.justify") }
                .tag(AppModel.Section.readings)
        }
        .tint(.primary)
    }
}
