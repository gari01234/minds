import SwiftUI

// "Ahora": what needs Gari now, at a glance, without waiting for the web page.
// Ideas stays the web app's own view, shown here under the same switch as on the web.
struct AhoraView: View {
    @Environment(AppModel.self) private var model
    @State private var showWeek = false

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 14) {
            header
            Picker("Vista", selection: $model.ahoraMode) {
                Text("Ahora").tag(AppModel.AhoraMode.ahora)
                Text("Ideas").tag(AppModel.AhoraMode.ideas)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            if model.ahoraMode == .ideas {
                WebTabView(session: model.webPortal, active: model.tab == .ahora && model.ahoraMode == .ideas)
            } else {
                ScrollView {
                    content
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                }
                .refreshable { await model.reloadAhora() }
            }
        }
        .padding(.top, 8)
        .background(WindowStyle.paper.ignoresSafeArea())
        .onChange(of: model.ahoraMode) { _, _ in model.showWebSection() }
        .sheet(isPresented: $showWeek) { weatherWeek }
    }

    // MARK: Header with the weather

    private var weather: FeedItem? { model.feed.first(where: \.isWeather) }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.todayText)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(WindowStyle.soft)
                Text("Ahora").font(.largeTitle.bold())
            }
            Spacer(minLength: 0)
            if let weather {
                Button { showWeek = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: Self.symbol(for: weather.body))
                            .foregroundStyle(WindowStyle.soft)
                        Text(weather.body)
                            .font(.footnote)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: 150, alignment: .leading)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(WindowStyle.card, in: Capsule())
                    .overlay(Capsule().stroke(WindowStyle.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clima: " + weather.body + ". Ver la semana")
            }
        }
        .foregroundStyle(WindowStyle.ink)
        .padding(.horizontal, 20)
    }

    private var weatherWeek: some View {
        NavigationStack {
            List {
                if let weather {
                    Text(weather.body)
                    ForEach(weather.details, id: \.self) { day in
                        HStack {
                            Text(day.label)
                            Spacer()
                            Text(day.value).foregroundStyle(WindowStyle.soft)
                        }
                    }
                }
            }
            .navigationTitle(weather?.title ?? "Clima")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { showWeek = false } } }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: Content

    private var content: some View {
        VStack(alignment: .leading, spacing: 22) {
            if let error = model.ahoraError {
                Text(error).font(.footnote).foregroundStyle(WindowStyle.error)
            }
            if model.openProposals > 0 { proposalsCard }
            if !model.fristen.isEmpty {
                section("Próximas Fristen") { fristenList }
            }
            section("Hoy") { todayList }
            let suggestions = Array(model.feed.filter { !$0.isWeather }.prefix(4))
            if !suggestions.isEmpty {
                section("Isabella sugiere") {
                    VStack(spacing: 10) {
                        ForEach(suggestions) { suggestion($0) }
                    }
                }
            }
        }
        .foregroundStyle(WindowStyle.ink)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ body: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased()).windowSectionTitle()
            body()
        }
    }

    private var proposalsCard: some View {
        Button { model.tab = .bandeja } label: {
            HStack(spacing: 12) {
                Image(systemName: "tray")
                    .foregroundStyle(WindowStyle.information)
                    .frame(width: 36, height: 36)
                    .background(WindowStyle.informationBg, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.openProposals == 1 ? "1 cosa por confirmar" : "\(model.openProposals) cosas por confirmar")
                        .font(.subheadline.weight(.semibold))
                    Text(Self.perProject(model.akteEntries.filter { model.decided[$0.id] == nil }))
                        .font(.footnote)
                        .foregroundStyle(WindowStyle.soft)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(WindowStyle.faint)
            }
            .padding(14)
            .windowCard()
        }
        .buttonStyle(.plain)
    }

    private var fristenList: some View {
        VStack(spacing: 0) {
            ForEach(Array(model.fristen.prefix(4).enumerated()), id: \.element.id) { index, frist in
                if index > 0 { Divider().padding(.leading, 72) }
                Button { model.openProject(frist.projectKey) } label: {
                    HStack(spacing: 12) {
                        daysBadge(frist.daysLeft)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(frist.title)
                                .font(.subheadline.weight(.semibold))
                                .multilineTextAlignment(.leading)
                            Text([frist.projectName, frist.dayText].compactMap { $0 }.joined(separator: " · "))
                                .font(.footnote)
                                .foregroundStyle(WindowStyle.soft)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .windowCard()
    }

    private func daysBadge(_ days: Int?) -> some View {
        let soon = (days ?? 99) <= 3
        return VStack(spacing: 0) {
            if let days, days > 0 {
                Text("\(days)").font(.headline.weight(.bold))
                Text(days == 1 ? "día" : "días").font(.caption2.weight(.semibold))
            } else {
                Text("hoy").font(.subheadline.weight(.bold))
            }
        }
        .foregroundStyle(soon ? WindowStyle.attention : WindowStyle.ink)
        .frame(width: 46, height: 46)
        .background(soon ? WindowStyle.attentionBg : Color(red: 0.953, green: 0.953, blue: 0.945),
                    in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private var todayList: some View {
        if model.events.isEmpty && model.dayTasks.isEmpty {
            Text("Nada para hoy.")
                .font(.subheadline)
                .foregroundStyle(WindowStyle.soft)
                .padding(14)
                .windowCard()
        } else {
            VStack(spacing: 0) {
                ForEach(Array(model.events.enumerated()), id: \.element.id) { index, event in
                    if index > 0 { Divider().padding(.leading, 14) }
                    Button { model.open(section: "calendar") } label: {
                        HStack(spacing: 12) {
                            Text(event.allDay ? "Día" : Self.time(event.startDate))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color(red: 0.239, green: 0.251, blue: 0.275))
                                .frame(width: 48, alignment: .leading)
                            RoundedRectangle(cornerRadius: 2).fill(WindowStyle.information).frame(width: 3, height: 32)
                            Text(event.title).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                ForEach(Array(model.dayTasks.enumerated()), id: \.element.id) { index, task in
                    if index > 0 || !model.events.isEmpty { Divider().padding(.leading, 48) }
                    Button { model.open(section: "calendar") } label: { taskRow(task) }
                        .buttonStyle(.plain)
                        .accessibilityHint("Abre la tarea en Tiempo")
                }
            }
            .windowCard()
        }
    }

    // Same order and wording as the web app's day list.
    private func taskRow(_ task: DayTask) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .stroke(Color(red: 0.769, green: 0.773, blue: 0.765), lineWidth: 1.6)
                if task.done {
                    Image(systemName: "checkmark").font(.caption2.weight(.bold)).foregroundStyle(WindowStyle.soft)
                }
            }
            .frame(width: 22, height: 22)
            .padding(.top, 1)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.subheadline.weight(.semibold))
                    .strikethrough(task.done)
                    .foregroundStyle(task.done ? WindowStyle.soft : WindowStyle.ink)
                    .multilineTextAlignment(.leading)
                if !task.subtitle.isEmpty {
                    Text(task.subtitle).font(.footnote).foregroundStyle(WindowStyle.soft)
                }
                ForEach(model.sessions[task.clientKey ?? ""] ?? []) { session in
                    Text(Self.sessionText(session))
                        .font(.footnote)
                        .foregroundStyle(Color(red: 0.239, green: 0.251, blue: 0.275))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(WindowStyle.border, lineWidth: 1))
                }
            }
            Spacer(minLength: 0)
            Text(task.isSpan ? "En curso" : (task.done ? "Hecha" : "Hoy"))
                .font(.footnote)
                .foregroundStyle(WindowStyle.faint)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .contentShape(Rectangle())
    }

    private func suggestion(_ item: FeedItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(item.title).font(.subheadline.weight(.semibold))
            if !item.body.isEmpty {
                Text(item.body).font(.subheadline).foregroundStyle(Color(red: 0.165, green: 0.173, blue: 0.188))
            }
            HStack {
                Button { model.discuss(item) } label: {
                    Text("Comentar con Isabella")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 38)
                        .foregroundStyle(.white)
                        .background(WindowStyle.ink, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .windowCard()
    }

    // MARK: Formatting

    static var todayText: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_ES")
        formatter.dateFormat = "EEEE, d 'de' MMMM"
        let text = formatter.string(from: Date())
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    static func time(_ date: Date?) -> String {
        guard let date else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_ES")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    static func sessionText(_ session: AgendaEvent) -> String {
        let start = time(session.startDate)
        guard let from = session.startDate, let to = session.endDate else { return start }
        let minutes = max(0, Int(to.timeIntervalSince(from) / 60))
        return start + " · \(minutes) min reservados"
    }

    static func perProject(_ entries: [AkteEntry]) -> String {
        var counts: [(String, Int)] = []
        for entry in entries {
            if let index = counts.firstIndex(where: { $0.0 == entry.projectName }) {
                counts[index].1 += 1
            } else {
                counts.append((entry.projectName, 1))
            }
        }
        return "Isabella: " + counts.map { "\($0.1) en \($0.0)" }.joined(separator: ", ")
    }

    static func symbol(for text: String) -> String {
        let lower = text.lowercased()
        if lower.contains("tormenta") { return "cloud.bolt" }
        if lower.contains("niev") || lower.contains("nieve") { return "cloud.snow" }
        if lower.contains("lluv") || lower.contains("chubasco") { return "cloud.rain" }
        if lower.contains("niebla") { return "cloud.fog" }
        if lower.contains("nub") { return "cloud" }
        if lower.contains("sol") || lower.contains("despejado") { return "sun.max" }
        return "thermometer.medium"
    }
}
