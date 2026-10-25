import WidgetKit
import SwiftUI

struct ContinuityWidgetEntry: TimelineEntry {
    let date: Date
    let glance: ContinuityGlance?
}

struct ContinuityTimeline: TimelineProvider {
    func placeholder(in context: Context) -> ContinuityWidgetEntry {
        ContinuityWidgetEntry(date: Date(), glance: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (ContinuityWidgetEntry) -> Void) {
        completion(ContinuityWidgetEntry(date: Date(), glance: GlanceStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ContinuityWidgetEntry>) -> Void) {
        let entry = ContinuityWidgetEntry(date: Date(), glance: GlanceStore.load())
        // A periodic refresh is a best effort, not a promise of real-time updates.
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 60))))
    }
}

struct ContinuityWidgetView: View {
    let entry: ContinuityWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Isabella")
                .font(.headline)
            if let glance = entry.glance {
                Text("\(glance.reviews) revisiones")
                    .font(.subheadline.weight(.semibold))
                    .privacySensitive()
                Text("\(glance.attention) avisos · \(glance.activeCommitments) compromisos")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .privacySensitive()
            } else {
                Text("Abre MINDS para actualizar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }
}

struct IsabellaContinuityWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "IsabellaContinuity", provider: ContinuityTimeline()) { entry in
            ContinuityWidgetView(entry: entry)
        }
        .configurationDisplayName("Continuidad de Isabella")
        .description("Estados verificados, sin contenido documental privado.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

@main
struct MINDSWidgets: WidgetBundle {
    var body: some Widget {
        IsabellaContinuityWidget()
    }
}
