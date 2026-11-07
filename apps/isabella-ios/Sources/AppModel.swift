import Foundation
import Observation
import WidgetKit

@MainActor
@Observable
final class AppModel {
    enum Section: Hashable { case web, continuity, chat, calendar }
    // The app's own tab bar; every tab shows the one shared web page (web and desktop are the same).
    // Persönlich: Chat · Ahora · Tiempo · Work · Bandeja. Office: Romy · Heute · Kalender · Work · Tools.
    enum Tab: Hashable { case chat, ahora, tiempo, work, bandeja, tools }

    // Two accounts, like switching users on GitHub: each keeps its own sign-in and data.
    private static let accountKey = "window.account"
    var account: WindowAccount = AppModel.initialAccount()
    var officeAuthenticated = false
    var officeEmail = ""
    var officePassword = ""
    var officeError: String?
    var isOfficeSigningIn = false

    var section: Section = .web
    var tab: Tab = .chat
    // «Por confirmar» in the Bandeja: the tab badge. The page sends it when it counts
    // (shell.badge); the app also counts on launch and when it comes back.
    var openProposals = 0
    private var pendingWebExtra: [String: String] = [:]
    var messages: [ChatMessage] = []
    var tasks: [AgendaTask] = []
    var events: [AgendaEvent] = []
    var continuityItems: [ContinuityItem] = []
    var continuityError: String?
    var localRemindersEnabled = UserDefaults.standard.bool(forKey: "minds.native.reminders.enabled")
    var isLoading = true
    var isAuthenticated = false
    var isAuthenticating = false
    var isThinking = false
    var isReviewing = false
    var composerText = ""
    var loginEmail = ""
    var loginCode = ""
    var codeSent = false
    var errorMessage: String?
    var pendingReview: NativeReviewProposal?

    let webPortal = MINDSWebPortalSession(account: .personal)
    let officePortal = MINDSWebPortalSession(account: .office)
    let backend = BackendClient()
    let office = OfficeSession()
    let notifications = NotificationService()

    // The web page of the account on screen.
    var activePortal: MINDSWebPortalSession { account == .office ? officePortal : webPortal }

    // The app owns the session; the web app asks for it through the bridge.
    init() {
        webPortal.sessionProvider = { [backend] in try await backend.bridgeSession() }
        webPortal.onSignOut = { [weak self] in await self?.logout() }
        webPortal.onSessionLost = { [weak self] in self?.isAuthenticated = false }
        webPortal.onNavigate = { [weak self] section, extra in self?.open(section: section, extra: extra) }
        webPortal.onBadge = { [weak self] count in self?.openProposals = count }
        webPortal.onSwitchAccount = { [weak self] target in self?.switchAccount(to: target) }
        officePortal.sessionProvider = { [office] in try await office.bridgeSession() }
        officePortal.onSignOut = { [weak self] in await self?.logoutOffice() }
        officePortal.onSessionLost = { [weak self] in self?.officeAuthenticated = false }
        officePortal.onNavigate = { [weak self] section, extra in self?.open(section: section, extra: extra) }
        officePortal.onSwitchAccount = { [weak self] target in self?.switchAccount(to: target) }
        // Each page sees the other account's calendar, read-only, through the app's own sessions.
        webPortal.otherCalendar = { [office] from, to in try await office.calendarEvents(from: from, to: to) }
        officePortal.otherCalendar = { [backend] from, to in try await backend.calendarEvents(from: from, to: to) }
    }

    private static func initialAccount() -> WindowAccount {
        #if DEBUG
        // The simulator smoke test opens the office account (its sign-in, nothing is sent).
        if ProcessInfo.processInfo.arguments.contains("-WindowUITestOffice") { return .office }
        #endif
        return WindowAccount(rawValue: UserDefaults.standard.string(forKey: accountKey) ?? "") ?? .personal
    }

    // MARK: Accounts

    func switchAccount(to target: WindowAccount) {
        guard target != account else { return }
        account = target
        UserDefaults.standard.set(target.rawValue, forKey: Self.accountKey)
        pendingWebExtra = [:]
        tab = .chat
        officeError = nil
        Task {
            if target == .office { officeAuthenticated = await office.isSignedIn }
            else { await refreshBadge() }
        }
    }

    func signInOffice() async {
        isOfficeSigningIn = true
        defer { isOfficeSigningIn = false }
        do {
            try await office.signIn(email: officeEmail, password: officePassword)
            officePassword = ""
            officeError = nil
            officeAuthenticated = true
            officePortal.reloadIfStarted()
        } catch {
            officePassword = ""
            officeError = error.localizedDescription
        }
    }

    func logoutOffice() async {
        await office.logout()
        await officePortal.clearForLogout()
        officeAuthenticated = false
        officePassword = ""
    }

    // MARK: Tabs and the shared web page

    // A section the page asked for (nav.open), or one the app opens itself.
    func open(section: String, extra: [String: String] = [:]) {
        pendingWebExtra = extra
        let previous = tab
        switch section {
        case "assistant": tab = .chat
        case "feed": tab = .ahora
        case "calendar": tab = .tiempo
        case "work": tab = .work
        case "bandeja" where account == .personal: tab = .bandeja
        case "ideas" where account == .personal: tab = .bandeja; pendingWebExtra["view"] = "ideas"
        case "tools", "projects", "plans":
            guard account == .office else { return }
            tab = .tools
            if section != "tools" { pendingWebSection = section }
        default: return
        }
        // A new tab shows its section through MainTabView's onChange (with the extra).
        if tab == previous { showWebSection() }
    }

    // Projekte and Terminplan-Muster open inside the Tools tab of the office account.
    private var pendingWebSection: String?

    func showWebSection() {
        let extra = pendingWebExtra
        pendingWebExtra = [:]
        let section = pendingWebSection ?? Self.webSection(for: tab)
        pendingWebSection = nil
        activePortal.show(section: section, extra: extra)
    }

    static func webSection(for tab: Tab) -> String {
        switch tab {
        case .chat: return "assistant"
        case .ahora: return "feed"
        case .tiempo: return "calendar"
        case .work: return "work"
        case .bandeja: return "bandeja"
        case .tools: return "tools"
        }
    }

    func openProject(_ key: String?) {
        open(section: "work", extra: key.map { ["project": $0] } ?? [:])
    }

    func refreshBadge() async {
        guard account == .personal else { return }
        guard isAuthenticated else { openProposals = 0; return }
        if let count = try? await backend.openProposalCount() { openProposals = count }
    }

    func bootstrap() async {
        isLoading = true
        isAuthenticated = await backend.isSignedIn
        officeAuthenticated = await office.isSignedIn
        isLoading = false
        if isAuthenticated {
            await reloadContinuity()
            await refreshBadge()
        }
    }

    func sendCode() async {
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            try await backend.sendEmailCode(loginEmail)
            codeSent = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyCode() async {
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            try await backend.verifyEmailCode(loginEmail, code: loginCode)
            loginCode = ""
            codeSent = false
            isAuthenticated = true
            errorMessage = nil
            webPortal.reloadIfStarted()
            await reloadContinuity()
            await refreshBadge()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() async {
        await backend.logout()
        await webPortal.clearForLogout()
        await notifications.removeTaskReminders()
        localRemindersEnabled = false
        UserDefaults.standard.set(false, forKey: "minds.native.reminders.enabled")
        isAuthenticated = false
        openProposals = 0
        codeSent = false
        pendingReview = nil
        GlanceStore.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: "IsabellaContinuity")
        messages = []
        tasks = []
        events = []
        continuityItems = []
        continuityError = nil
        errorMessage = nil
    }

    func reload() async {
        do {
            async let remoteTasks = backend.tasks()
            async let remoteEvents = backend.events()
            async let remoteMessages = backend.history()
            async let remoteReview = backend.pendingReview()
            let (loadedTasks, loadedEvents, loadedMessages, loadedReview) =
                try await (remoteTasks, remoteEvents, remoteMessages, remoteReview)
            tasks = loadedTasks
            events = loadedEvents
            if !isThinking {
                messages = loadedMessages
                pendingReview = loadedReview
            }
            errorMessage = nil
            if localRemindersEnabled {
                do {
                    let eligible = try await backend.localReminderTasks()
                    _ = try await notifications.syncTaskReminders(eligible)
                }
                catch { errorMessage = error.localizedDescription }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reloadContinuity() async {
        do {
            let items = try await backend.continuityItems()
            continuityItems = items
            GlanceStore.save(items)
            WidgetCenter.shared.reloadTimelines(ofKind: "IsabellaContinuity")
            continuityError = nil
        } catch {
            continuityItems = []
            GlanceStore.clear()
            WidgetCenter.shared.reloadTimelines(ofKind: "IsabellaContinuity")
            continuityError = error.localizedDescription
        }
    }

    func enableLocalReminders() async {
        do {
            guard try await notifications.requestAuthorization() else {
                throw BackendError.rejected("Las notificaciones no están autorizadas en iOS.")
            }
            let eligible = try await backend.localReminderTasks()
            _ = try await notifications.syncTaskReminders(eligible)
            localRemindersEnabled = true
            UserDefaults.standard.set(true, forKey: "minds.native.reminders.enabled")
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }

    func disableLocalReminders() async {
        await notifications.removeTaskReminders()
        localRemindersEnabled = false
        UserDefaults.standard.set(false, forKey: "minds.native.reminders.enabled")
    }

    func sendCurrentMessage() async {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isAuthenticated, !text.isEmpty, !isThinking, pendingReview == nil else { return }
        let requestID = UUID()
        composerText = ""
        messages.append(ChatMessage(id: requestID, role: .user, text: text))
        isThinking = true
        defer { isThinking = false }

        do {
            let response = try await backend.sendMessage(text, requestID: requestID)
            if !response.reply.isEmpty {
                messages.append(ChatMessage(role: .assistant, text: response.reply))
            }
            if response.proposals.count == 1 && response.invalidProposalCount == 0 {
                pendingReview = response.proposals[0]
            } else if response.proposals.count > 1 || response.invalidProposalCount > 0 {
                messages.append(ChatMessage(role: .assistant, text:
                    "Hay propuestas que requieren revisión en MINDS web. No se aplicó ningún cambio."))
            }
        } catch {
            // The server may have completed an ambiguous transport failure.
            // Never start another model call automatically.
            messages.append(ChatMessage(role: .assistant, text:
                "No pude verificar la respuesta. No repetiré el turno automáticamente: "
                + error.localizedDescription))
        }
    }

    func resolveReview(approve: Bool) async {
        guard let proposal = pendingReview, !isReviewing else { return }
        isReviewing = true
        defer { isReviewing = false }
        do {
            let text = try await backend.review(proposal, approve: approve)
            pendingReview = nil
            messages.append(ChatMessage(role: .assistant, text: text))
            // Canonical readback also occurs inside backend.review before success.
            await reload()
        } catch {
            // Keep proposal visible: an HTTP failure cannot prove no server write.
            errorMessage = error.localizedDescription
        }
    }
}
