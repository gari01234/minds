import Foundation

// Native projection only. Canonical state belongs to Supabase/MINDS.
// Never infer an actionable user request from a paused mission or an unconsumed alert.
struct ContinuityItem: Identifiable {
    enum Kind: String {
        case review, attention, mission, commitment
    }

    let id: String
    let kind: Kind
    let title: String
    let detail: String
    let sourceState: String
    let sourceID: UUID

    var heading: String {
        switch kind {
        case .review: return "Necesita revisión"
        case .attention: return "Requiere tu atención"
        case .mission: return "Estado del trabajo"
        case .commitment: return "Compromiso activo"
        }
    }
}
