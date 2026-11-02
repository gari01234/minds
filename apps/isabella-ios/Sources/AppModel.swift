import Foundation
import Observation
import WidgetKit

@MainActor
@Observable
final class AppModel {
    enum Section: Hashable { case web, continuity, chat, calendar }
    // The app's own tab bar; Chat, Tiempo and Work show the shared web page.
    enum Tab: Hashable { case chat, ahora, tiempo, work, bandeja }
    enum AhoraMode: Hashable { case ahora, ideas }

    var section: Section = .web
    var tab: Tab = .chat
    var ahoraMode: AhoraMode = .ahora
    var akteEntries: [AkteEntry] = []
    var fristen: [AkteEntry] = []
    var feed: [FeedItem] = []
    var dayTasks: [DayTask] = []
    var sessions: [String: [AgendaEvent]] = [:]
    var ahoraError: String?
    var bandejaError: String?
    var deciding: Set<String> = []
    var decided: [String: String] = [:]
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

    let webPortal = MINDSWebPortalSession()
    let backend = BackendClient()
    let notifications = NotificationService()

    // The app owns the session; the web app asks for it through the bridge.
    init() {
        webPortal.sessionProvider = { [backend] in try await backend.bridgeSession() }
        webPortal.onSignOut = { [weak self] in await self?.logout() }
        webPortal.onSessionLost = { [weak self] in self?.isAuthenticated = false }
        webPortal.onNavigate = { [weak self] section in self?.open(section: section) }
    }

    // MARK: Tabs and the shared web page

    var openProposals: Int { akteEntries.filter { decided[$0.id] == nil }.count }

    // A section the page asked for (nav.open), or one the app opens itself.
    func open(section: String, extra: [String: String] = [:]) {
        pendingWebExtra = extra
        switch section {
        case "assistant": tab = .chat
        case "calendar": tab = .tiempo
        case "work": tab = .work
        case "feed": ahoraMode = .ahora; tab = .ahora
        case "ideas": ahoraMode = .ideas; tab = .ahora
        default: return
        }
        showWebSection()
    }

    func showWebSection() {
        let extra = pendingWebExtra
        pendingWebExtra = [:]
        switch tab {
        case .chat: webPortal.show(section: "assistant", extra: extra)
        case .tiempo: webPortal.show(section: "calendar", extra: extra)
        case .work: webPortal.show(section: "work", extra: extra)
        case .ahora where ahoraMode == .ideas: webPortal.show(section: "ideas")
        default: break
        }
    }

    func openProject(_ key: String?) {
        open(section: "work", extra: key.map { ["project": $0] } ?? [:])
    }

    func discuss(_ item: FeedItem) {
        open(section: "assistant", extra: ["draft": item.prompt ?? item.title])
    }

    // MARK: Ahora and Bandeja

    func reloadAhora() async {
        do {
            async let entries = backend.pendingAkteEntries()
            async let deadlines = backend.upcomingFristen()
            async let items = backend.feedItems()
            async let todays = backend.dayTasks()
            async let upcoming = backend.events()
            let (e, d, f, t, v) = try await (entries, deadlines, items, todays, upcoming)
            akteEntries = e
            fristen = d
            feed = f
            dayTasks = t
            let today = v.filter { $0.startDate.map(Calendar.current.isDateInToday) ?? false }
            // Work sessions belong to their task (web: "10:00 · 120 min reservados").
            events = today.filter { $0.sessionTaskKey == nil }
            sessions = Dictionary(grouping: today.filter { $0.sessionTaskKey != nil }, by: { $0.sessionTaskKey ?? "" })
            decided = decided.filter { id, _ in e.contains { $0.id == id } }
            ahoraError = nil
            bandejaError = nil
        } catch {
            ahoraError = error.localizedDescription
            bandejaError = error.localizedDescription
        }
    }

    func reloadBandeja() async {
        do {
            akteEntries = try await backend.pendingAkteEntries()
            decided = [:]
            bandejaError = nil
        } catch { bandejaError = error.localizedDescription }
    }

    // Saved only when the backend confirms it; otherwise the card stays as it was.
    func decide(_ entry: AkteEntry, _ decision: AkteDecision) async {
        guard !deciding.contains(entry.id), decided[entry.id] == nil else { return }
        deciding.insert(entry.id)
        defer { deciding.remove(entry.id) }
        do {
            switch decision {
            case .confirm: try await backend.decideAkteEntry(id: entry.id, status: "confirmed")
            case .reject: try await backend.decideAkteEntry(id: entry.id, status: "rejected")
            case .resolve: try await backend.decideAkteEntry(id: entry.id, status: "resolved")
            case .makeTask: try await backend.akteEntryToTask(id: entry.id)
            }
            decided[entry.id] = {
                switch decision {
                case .confirm: return "Bestätigt · guardado en la Akte"
                case .resolve: return "Geklärt · guardado en la Akte"
                case .makeTask: return "Aufgabe angelegt"
                case .reject: return entry.kind == .widerspruch ? "Kein Widerspruch" : "Verworfen"
                }
            }()
            bandejaError = nil
        } catch {
            bandejaError = "No pude guardar la decisión: " + error.localizedDescription
        }
    }

    func bootstrap() async {
        isLoading = true
        isAuthenticated = await backend.isSignedIn
        isLoading = false
        if isAuthenticated { await reloadContinuity() }
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
