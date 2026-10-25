import Foundation
import Observation
import WidgetKit

@MainActor
@Observable
final class AppModel {
    enum Section: Hashable { case web, continuity, chat, calendar }

    var section: Section = .web
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

    func bootstrap() async {
        isLoading = true
        isAuthenticated = await backend.isSignedIn
        if isAuthenticated { await reload(); await reloadContinuity() }
        isLoading = false
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
            isAuthenticated = true
            errorMessage = nil
            await reload()
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
