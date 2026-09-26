import Foundation

enum BackendError: Error {
    case notConfigured
    case invalidResponse
}

actor BackendClient {
    private var supabaseURL: URL? {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            !raw.isEmpty
        else { return nil }
        return URL(string: raw)
    }

    private var anonKey: String? {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !value.isEmpty
        else { return nil }
        return value
    }

    func sendMessage(_ text: String) async throws -> String {
        guard supabaseURL != nil, anonKey != nil else {
            throw BackendError.notConfigured
        }

        // El backend ya existe; esta primera capa nativa evita inventar
        // un segundo modelo de datos o una API paralela. La autenticación
        // de MINDS se cableará aquí antes de usar isabella-chat.
        throw BackendError.notConfigured
    }
}
