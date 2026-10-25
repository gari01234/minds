import UIKit
import UniformTypeIdentifiers

// Share sheet: save a durable, owner-unclassified original in the app group's
// protected inbox. Never reads an auth token or invokes MINDS from an extension.
@MainActor
final class ShareViewController: UIViewController {
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()
    private let saveButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        titleLabel.text = "Guardar en MINDS"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        statusLabel.text = "El original quedará pendiente de revisión en Isabella."
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0
        saveButton.setTitle("Guardar fuente", for: .normal)
        saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [titleLabel, statusLabel, saveButton])
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 22
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor)
        ])
    }

    @objc private func save() {
        guard let providers = extensionContext?.inputItems
            .compactMap({ $0 as? NSExtensionItem })
            .flatMap({ $0.attachments ?? [] }), let provider = providers.first
        else {
            statusLabel.text = "No hay un archivo, enlace o texto compatible."
            return
        }
        saveButton.isEnabled = false
        statusLabel.text = "Copiando la fuente de manera privada…"

        // Prioritize a file over its textual preview. Apple supplies temporary
        // URLs to the completion block only; the copy MUST occur in that block.
        let fileIdentifier = provider.registeredTypeIdentifiers.first { id in
            guard let type = UTType(id) else { return false }
            return type.conforms(to: .image) || type.conforms(to: .pdf)
                || (type.conforms(to: .data) && !type.conforms(to: .text))
        }
        if let identifier = fileIdentifier {
            provider.loadFileRepresentation(forTypeIdentifier: identifier) { [weak self] url, error in
                let result: Result<CapturedSource, Error>
                do {
                    if let error { throw error }
                    guard let url else { throw CaptureInboxError.missingPayload }
                    let mime = UTType(identifier)?.preferredMIMEType ?? "application/octet-stream"
                    result = .success(try CaptureInboxStore.stageFile(url, mime: mime))
                } catch { result = .failure(error) }
                DispatchQueue.main.async { self?.finish(result) }
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, error in
                let result: Result<CapturedSource, Error>
                do {
                    if let error { throw error }
                    guard let url = item as? URL else { throw CaptureInboxError.missingPayload }
                    result = .success(try CaptureInboxStore.stageText(url.absoluteString, sourceURL: url))
                } catch { result = .failure(error) }
                DispatchQueue.main.async { self?.finish(result) }
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, error in
                let result: Result<CapturedSource, Error>
                do {
                    if let error { throw error }
                    guard let text = item as? String else { throw CaptureInboxError.missingPayload }
                    result = .success(try CaptureInboxStore.stageText(text))
                } catch { result = .failure(error) }
                DispatchQueue.main.async { self?.finish(result) }
            }
            return
        }
        statusLabel.text = "Este formato todavía no está admitido."
        saveButton.isEnabled = true
    }

    private func finish(_ result: Result<CapturedSource, Error>) {
        switch result {
        case .success:
            statusLabel.text = "La fuente se guardó. Revísala en Isabella."
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        case .failure(let error):
            statusLabel.text = "No se guardó la fuente: " + error.localizedDescription
            saveButton.isEnabled = true
        }
    }
}
