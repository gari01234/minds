import UIKit
import SwiftUI
import Observation
import UniformTypeIdentifiers

// Share sheet with two accounts, Office first (Gari uses it far more):
// - Office: the files go to the Desktop of a project (the projects in whose team the person is),
//   into the folder they choose. With a valid access token now; otherwise staged for the app.
// - Persönlich: as before, an original in the App Group's private inbox, reviewed in Isabella.
// The extension never refreshes a session and never calls Isabella.
@MainActor
final class ShareViewController: UIViewController {
    private let model = ShareModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        model.context = extensionContext
        let host = UIHostingController(rootView: ShareRootView(model: model))
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
        Task { await model.load() }
    }
}

func L(_ key: String) -> String { NSLocalizedString(key, comment: "") }

enum ShareAccount: String, Hashable { case office, personal }

struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
    var name: String
    let mime: String
}

@MainActor
@Observable
final class ShareModel {
    weak var context: NSExtensionContext?
    var account: ShareAccount = .personal
    var officeAvailable = false
    var files: [SharedFile] = []
    var text: String?
    var sourceURL: URL?
    var projects: [OfficeShareProject] = []
    var folders: [OfficeShareFolder] = []
    var projectID: String?
    var folderID: String?
    var status: String?
    var officeHint: String?
    var loading = true
    var busy = false
    var done = false
    private var cache: OfficeShareStore.Cache?

    var canSave: Bool {
        guard !loading, !busy, !done else { return false }
        if account == .office { return !files.isEmpty && projectID != nil }
        return !files.isEmpty || text != nil
    }

    // «Pläne › Eingang», sorted, for the folder picker.
    var folderRows: [(id: String, label: String)] {
        let byID = Dictionary(uniqueKeysWithValues: folders.map { ($0.id, $0) })
        func path(_ folder: OfficeShareFolder) -> String {
            var names = [folder.name], parent = folder.parentID, guardCount = 0
            while let id = parent, let up = byID[id], guardCount < 20 {
                names.insert(up.name, at: 0); parent = up.parentID; guardCount += 1
            }
            return names.joined(separator: " › ")
        }
        return folders.map { ($0.id, path($0)) }.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }

    func load() async {
        officeAvailable = OfficeShareKeychain.isSignedIn
        account = officeAvailable ? .office : .personal
        await loadItems()
        if officeAvailable { await loadOffice() }
        loading = false
        if files.isEmpty && text == nil { status = L("share.unsupported") }
    }

    private func loadItems() async {
        let providers = (context?.inputItems ?? [])
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] }
        guard let incoming = try? OfficeShareStore.incomingDirectory() else { return }
        for provider in providers.prefix(10) {
            // A file before its textual preview: Outlook's «Drucken» hands over a PDF.
            let identifier = provider.registeredTypeIdentifiers.first { id in
                guard let type = UTType(id) else { return false }
                return type.conforms(to: .image) || type.conforms(to: .pdf)
                    || (type.conforms(to: .data) && !type.conforms(to: .text))
            }
            if let identifier, let file = await Self.copyFile(provider, identifier: identifier, into: incoming) {
                files.append(file)
            } else if text == nil, let shared = await Self.loadText(provider) {
                text = shared.text
                sourceURL = shared.url
            }
        }
    }

    // Apple's temporary URL lives only inside the completion block: copy there.
    nonisolated private static func copyFile(_ provider: NSItemProvider, identifier: String,
                                             into directory: URL) async -> SharedFile? {
        let suggested = provider.suggestedName
        return await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: identifier) { url, _ in
                guard let url else { continuation.resume(returning: nil); return }
                let original = suggested.flatMap { name -> String? in
                    let ext = url.pathExtension
                    return name.isEmpty ? nil : (ext.isEmpty || name.lowercased().hasSuffix("." + ext.lowercased()) ? name : name + "." + ext)
                } ?? url.lastPathComponent
                let copy = directory.appendingPathComponent(UUID().uuidString.lowercased())
                do { try FileManager.default.copyItem(at: url, to: copy) }
                catch { continuation.resume(returning: nil); return }
                let mime = UTType(identifier)?.preferredMIMEType
                    ?? UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                    ?? "application/octet-stream"
                continuation.resume(returning: SharedFile(url: copy, name: original, mime: mime))
            }
        }
    }

    nonisolated private static func loadText(_ provider: NSItemProvider) async -> (text: String, url: URL?)? {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            let url: URL? = await withCheckedContinuation { continuation in
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    continuation.resume(returning: item as? URL)
                }
            }
            if let url { return (url.absoluteString, url) }
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            let text: String? = await withCheckedContinuation { continuation in
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    continuation.resume(returning: item as? String)
                }
            }
            if let text, !text.isEmpty { return (text, nil) }
        }
        return nil
    }

    private func loadOffice() async {
        let last = OfficeShareStore.loadLast()
        if let access = OfficeShareKeychain.access(),
           let live = try? await OfficeShareUploader(access: access).projects() {
            projects = live
            if let folders = try? await OfficeShareUploader(access: access).folders(projectIDs: live.map(\.id)) {
                let fresh = OfficeShareStore.Cache(userID: access.userID, projects: live, folders: folders, savedAt: Date())
                cache = fresh
                OfficeShareStore.saveCache(fresh)
            }
        } else if let user = OfficeShareKeychain.userID, let saved = OfficeShareStore.loadCache(userID: user) {
            cache = saved
            projects = saved.projects
        }
        if projects.isEmpty {
            officeHint = cache == nil && OfficeShareKeychain.access() == nil ? L("share.office.open") : L("share.office.noprojects")
        }
        projectID = projects.first(where: { $0.id == last?.projectID })?.id ?? projects.first?.id
        selectProject(preferredFolder: last?.projectID == projectID ? last?.folderID : nil)
    }

    // Keeps the chosen folder while it belongs to the project (folder ids are unique).
    func selectProject(preferredFolder: String? = nil) {
        let wanted = preferredFolder ?? folderID
        folders = projectID.flatMap { cache?.folders[$0] } ?? []
        folderID = folders.contains(where: { $0.id == wanted }) ? wanted : nil
    }

    private var target: OfficeShareTarget? {
        guard let projectID, let project = projects.first(where: { $0.id == projectID }) else { return nil }
        let folder = folderRows.first(where: { $0.id == folderID })
        return OfficeShareTarget(projectID: project.id, projectLabel: project.label,
                                 folderID: folder?.id, folderLabel: folder?.label)
    }

    func save() async {
        busy = true
        defer { busy = false }
        switch account {
        case .personal: savePersonal()
        case .office: await saveOffice()
        }
    }

    private func savePersonal() {
        do {
            for file in files {
                try CaptureInboxStore.stageFile(file.url, originalName: file.name, mime: file.mime)
                try? FileManager.default.removeItem(at: file.url)
            }
            if let text { try CaptureInboxStore.stageText(text, sourceURL: sourceURL) }
            finish(L("share.personal.saved"))
        } catch {
            status = String(format: L("share.error"), error.localizedDescription)
        }
    }

    private func saveOffice() async {
        guard let target else { status = L("share.office.noprojects"); return }
        OfficeShareStore.saveLast(target)
        var uploaded = 0, staged = 0
        var failures: [String] = []
        for file in files {
            if let access = OfficeShareKeychain.access(),
               (try? await OfficeShareUploader(access: access).upload(fileAt: file.url, name: file.name,
                                                                      mime: file.mime, target: target)) != nil {
                uploaded += 1
                try? FileManager.default.removeItem(at: file.url)
            } else if let user = OfficeShareKeychain.userID,
                      (try? OfficeShareStore.stage(fileAt: file.url, name: file.name, mime: file.mime,
                                                   target: target, userID: user)) != nil {
                staged += 1
            } else {
                failures.append(file.name)
            }
        }
        if !failures.isEmpty {
            status = String(format: L("share.error"), failures.joined(separator: ", "))
            files.removeAll { file in !failures.contains(file.name) }
            return
        }
        finish(staged == 0 ? String(format: L("share.office.saved"), target.label) : L("share.office.staged"))
    }

    private func finish(_ message: String) {
        status = message
        done = true
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            context?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    func cancel() {
        for file in files { try? FileManager.default.removeItem(at: file.url) }
        context?.cancelRequest(withError: NSError(domain: "WindowShare", code: NSUserCancelledError))
    }
}

struct ShareRootView: View {
    @Bindable var model: ShareModel

    var body: some View {
        NavigationStack {
            Form {
                if model.officeAvailable {
                    Section {
                        Picker(L("share.account"), selection: $model.account) {
                            Text("Office").tag(ShareAccount.office)
                            Text("Persönlich").tag(ShareAccount.personal)
                        }
                        .pickerStyle(.segmented)
                    }
                }
                Section(L("share.content")) {
                    if model.loading {
                        ProgressView()
                    } else if model.files.count == 1 {
                        TextField(L("share.name"), text: $model.files[0].name)
                    } else {
                        ForEach(model.files) { Text($0.name).lineLimit(1) }
                    }
                    if let text = model.text, model.account == .personal {
                        Text(text).lineLimit(3).foregroundStyle(.secondary)
                    }
                }
                if model.account == .office {
                    Section {
                        if model.projects.isEmpty {
                            Text(model.officeHint ?? "").foregroundStyle(.secondary)
                        } else {
                            Picker(L("share.project"), selection: $model.projectID) {
                                ForEach(model.projects) { Text($0.label).tag(Optional($0.id)) }
                            }
                            Picker(L("share.folder"), selection: $model.folderID) {
                                Text(L("share.folder.root")).tag(String?.none)
                                ForEach(model.folderRows, id: \.id) { Text($0.label).tag(Optional($0.id)) }
                            }
                        }
                    } footer: {
                        Text(model.files.isEmpty && model.text != nil ? L("share.office.filesonly") : L("share.office.reads"))
                    }
                } else {
                    Section { Text(L("share.personal.note")).foregroundStyle(.secondary) }
                }
                if let status = model.status {
                    Section { Text(status) }
                }
            }
            .navigationTitle(L("share.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("share.cancel")) { model.cancel() }.disabled(model.busy || model.done)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.busy { ProgressView() }
                    else { Button(L("share.save")) { Task { await model.save() } }.disabled(!model.canSave) }
                }
            }
            .onChange(of: model.projectID) { _, _ in model.selectProject() }
        }
    }
}
