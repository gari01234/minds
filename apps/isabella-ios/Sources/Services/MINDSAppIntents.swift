import AppIntents

struct OpenIsabellaIntent: AppIntent {
    static var title: LocalizedStringResource = "Abrir Isabella"
    static var description = IntentDescription("Abre la conversación personal de Isabella.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct MINDSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenIsabellaIntent(),
            phrases: [
                "Abrir Isabella en \(.applicationName)",
                "Hablar con Isabella en \(.applicationName)"
            ],
            shortTitle: "Abrir Isabella",
            systemImageName: "message"
        )
    }
}
