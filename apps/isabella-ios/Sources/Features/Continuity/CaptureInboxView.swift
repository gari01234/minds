import SwiftUI
import UniformTypeIdentifiers

struct CaptureInboxView: View {
    @State private var saved: [CapturedSource] = []
    @State private var draft = ""
    @State private var importer = false
    @State private var errorText: String?
    @State private var deleteCandidate: CapturedSource?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Una observación, una cita o una idea…", text: $draft, axis: .vertical)
                        .lineLimit(2...6)
                    Button("Guardar texto en espera", systemImage: "square.and.arrow.down") {
                        do {
                            _ = try CaptureInboxStore.stageText(draft)
                            draft = ""
                            reload()
                        } catch { errorText = error.localizedDescription }
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button("Elegir documento del iPhone", systemImage: "doc.badge.plus") {
                        importer = true
                    }
                } header: {
                    Text("Nueva fuente")
                } footer: {
                    Text("La captura no se añade automáticamente a memoria, tareas ni Work.")
                }

                Section("Pendientes de clasificación") {
                    if saved.isEmpty {
                        Text("Todavía no hay fuentes guardadas en este dispositivo.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(saved) { item in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.title).font(.body)
                            Text(item.createdAt.formatted(date: .abbreviated, time: .shortened)
                                 + " · " + ByteCountFormatter.string(fromByteCount: Int64(item.byteCount), countStyle: .file))
                                .font(.caption).foregroundStyle(.secondary)
                            Text("Original conservado · sin incorporar a MINDS")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 5)
                        .swipeActions {
                            Button("Eliminar", role: .destructive) { deleteCandidate = item }
                        }
                    }
                }
            }
            .navigationTitle("Capturas")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Actualizar", systemImage: "arrow.clockwise") { reload() }
                }
            }
            .task { reload() }
            .fileImporter(isPresented: $importer, allowedContentTypes: [.item]) { result in
                do {
                    let url = try result.get()
                    let granted = url.startAccessingSecurityScopedResource()
                    defer { if granted { url.stopAccessingSecurityScopedResource() } }
                    let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                        ?? "application/octet-stream"
                    _ = try CaptureInboxStore.stageFile(url, mime: mime)
                    reload()
                } catch { errorText = error.localizedDescription }
            }
            .alert("No se pudo guardar", isPresented: Binding(
                get: { errorText != nil },
                set: { if !$0 { errorText = nil } }
            )) {
                Button("Aceptar", role: .cancel) { errorText = nil }
            } message: {
                Text(errorText ?? "")
            }
            .confirmationDialog("Eliminar esta fuente del iPhone", isPresented: Binding(
                get: { deleteCandidate != nil },
                set: { if !$0 { deleteCandidate = nil } }
            )) {
                Button("Eliminar definitivamente", role: .destructive) {
                    guard let item = deleteCandidate else { return }
                    do {
                        try CaptureInboxStore.discard(item)
                        deleteCandidate = nil
                        reload()
                    } catch {
                        deleteCandidate = nil
                        errorText = error.localizedDescription
                    }
                }
                Button("Cancelar", role: .cancel) { deleteCandidate = nil }
            } message: {
                Text("Todavía no se ha incorporado al servidor. Esta acción elimina el original local.")
            }
        }
    }

    private func reload() {
        do { saved = try CaptureInboxStore.list(); errorText = nil }
        catch { errorText = error.localizedDescription }
    }
}
