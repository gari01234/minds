import WidgetKit
import SwiftUI

// The office day on the Home and Lock Screen: Heute, the next Frist and what is to be confirmed.
// It only reads the snapshot the app keeps (OfficeGlanceStore); it never holds a token or calls
// TBA Office itself, so a snapshot is as fresh as the last time Window or Siri looked.
struct OfficeWidgetEntry: TimelineEntry {
    let date: Date
    let glance: OfficeGlance?
}

struct OfficeTimeline: TimelineProvider {
    func placeholder(in context: Context) -> OfficeWidgetEntry { OfficeWidgetEntry(date: Date(), glance: nil) }

    func getSnapshot(in context: Context, completion: @escaping (OfficeWidgetEntry) -> Void) {
        completion(OfficeWidgetEntry(date: Date(), glance: OfficeGlanceStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OfficeWidgetEntry>) -> Void) {
        let entry = OfficeWidgetEntry(date: Date(), glance: OfficeGlanceStore.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
}

private func W(_ key: String) -> String { NSLocalizedString(key, comment: "") }

private func shortDate(_ day: String) -> String {
    let parts = day.split(separator: "-")
    return parts.count == 3 ? "\(parts[2]).\(parts[1])." : day
}

struct OfficeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: OfficeWidgetEntry

    var body: some View {
        Group {
            if let glance = entry.glance {
                if family == .accessoryRectangular {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(String(format: W("widget.office.today"), glance.todayCount)).font(.headline)
                        if let next = glance.deadlines.first {
                            Text(W("widget.office.deadline") + " " + shortDate(next.date) + " · " + next.title)
                                .font(.caption).lineLimit(1)
                        }
                        if glance.toConfirm > 0 {
                            Text(String(format: W("widget.office.toconfirm"), glance.toConfirm)).font(.caption)
                        }
                    }
                    .privacySensitive()
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Office").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Text(String(format: W("widget.office.today"), glance.todayCount)).font(.headline)
                        ForEach(glance.today.prefix(2), id: \.self) { item in
                            Text(item.title).font(.caption).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        if let next = glance.deadlines.first {
                            Text(W("widget.office.deadline") + " " + shortDate(next.date)).font(.caption2.weight(.semibold))
                            Text(next.title).font(.caption2).lineLimit(1)
                        }
                        if glance.toConfirm > 0 {
                            Text(String(format: W("widget.office.toconfirm"), glance.toConfirm))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .privacySensitive()
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Office").font(.headline)
                    Text(W("widget.office.open")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }
}

struct OfficeTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WindowOffice", provider: OfficeTimeline()) { entry in
            OfficeWidgetView(entry: entry)
        }
        .configurationDisplayName(W("widget.office.name"))
        .description(W("widget.office.description"))
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
