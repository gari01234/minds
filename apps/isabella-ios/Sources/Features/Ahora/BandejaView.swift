import SwiftUI

// "Bandeja": everything Isabella proposed for the Projektakte, across projects.
// Nothing enters the Akte without Gari: a card counts as done only when the
// backend confirms the change. Tapping a card shows why Isabella proposes it.
struct BandejaView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: String?
    @State private var expanded: Set<String> = []

    private struct Group: Identifiable {
        let name: String
        let entries: [AkteEntry]
        var id: String { name }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Bandeja").font(.largeTitle.bold())
                    Text("Lo que Isabella propone. Nada entra en la Akte sin tu confirmación. Toca una tarjeta para ver por qué.")
                        .font(.subheadline)
                        .foregroundStyle(WindowStyle.soft)
                }
                filters
                if let error = model.bandejaError {
                    Text(error).font(.footnote).foregroundStyle(WindowStyle.error)
                }
                if groups.isEmpty {
                    Text(model.akteEntries.isEmpty ? "Nada por confirmar." : "Nada pendiente en este proyecto.")
                        .font(.subheadline)
                        .foregroundStyle(WindowStyle.soft)
                        .padding(.top, 12)
                }
                ForEach(groups) { group in
                    Text(group.name.uppercased())
                        .windowSectionTitle()
                        .padding(.top, 6)
                    ForEach(group.entries) { card($0) }
                }
            }
            .foregroundStyle(WindowStyle.ink)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await model.reloadBandeja() }
        .background(WindowStyle.paper.ignoresSafeArea())
    }

    // MARK: Filters and grouping

    private var projects: [String] {
        var names: [String] = []
        for entry in model.akteEntries where !names.contains(entry.projectName) { names.append(entry.projectName) }
        return names
    }

    private var groups: [Group] {
        projects
            .filter { filter == nil || $0 == filter }
            .map { name in Group(name: name, entries: model.akteEntries.filter { $0.projectName == name }) }
            .filter { !$0.entries.isEmpty }
    }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                chip("Todo · \(model.openProposals)", selected: filter == nil) { filter = nil }
                ForEach(projects, id: \.self) { name in
                    chip(name, selected: filter == name) { filter = name }
                }
            }
        }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .foregroundStyle(selected ? Color.white : Color(red: 0.239, green: 0.251, blue: 0.275))
                .background(selected ? WindowStyle.ink : WindowStyle.card, in: Capsule())
                .overlay(Capsule().stroke(selected ? Color.clear : Color(red: 0.878, green: 0.878, blue: 0.871), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: A card

    private func card(_ entry: AkteEntry) -> some View {
        let open = expanded.contains(entry.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                kindChip(entry)
                Spacer(minLength: 8)
                Text([entry.topic, entry.source].compactMap { $0 }.first ?? "Isabella")
                    .font(.caption)
                    .foregroundStyle(WindowStyle.faint)
                    .lineLimit(1)
            }
            Button {
                if open { expanded.remove(entry.id) } else { expanded.insert(entry.id) }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Text(entry.title)
                        .font(.subheadline.weight(.semibold))
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Image(systemName: open ? "chevron.up" : "chevron.down")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(WindowStyle.faint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(open ? "Oculta la explicación" : "Muestra por qué lo propone Isabella")
            if let day = entry.dayText, entry.kind == .frist || entry.kind == .aufgabe {
                Text("bis " + day).font(.footnote).foregroundStyle(WindowStyle.soft)
            }
            if open { why(entry) }
            if let done = model.decided[entry.id] {
                Text(done).font(.footnote.weight(.semibold)).foregroundStyle(WindowStyle.success)
            } else {
                actions(entry)
            }
        }
        .padding(14)
        .windowCard()
    }

    private func kindChip(_ entry: AkteEntry) -> some View {
        let colors: (Color, Color) = {
            switch entry.kind {
            case .frist: return (WindowStyle.attention, WindowStyle.attentionBg)
            case .entscheidung: return (WindowStyle.information, WindowStyle.informationBg)
            case .aufgabe: return (WindowStyle.success, WindowStyle.successBg)
            case .widerspruch: return (WindowStyle.error, WindowStyle.errorBg)
            }
        }()
        return Text(entry.kindLabel)
            .font(.caption2.weight(.bold))
            .kerning(0.5)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(colors.0)
            .background(colors.1, in: RoundedRectangle(cornerRadius: 6))
    }

    private func why(_ entry: AkteEntry) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("POR QUÉ").font(.caption.weight(.bold)).foregroundStyle(WindowStyle.soft)
            Text(entry.reason.isEmpty
                 ? "Esta propuesta es anterior a las explicaciones: Isabella solo guardó de dónde la sacó."
                 : entry.reason)
                .font(.subheadline)
            if let quote = entry.quote {
                Text(quote)
                    .font(.system(.subheadline, design: .serif))
                    .foregroundStyle(Color(red: 0.239, green: 0.251, blue: 0.275))
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(Color(red: 0.827, green: 0.831, blue: 0.824)).frame(width: 2)
                    }
            }
            if let source = entry.source {
                Text("Fuente: " + source).font(.footnote).foregroundStyle(WindowStyle.soft)
            }
            Button("Abrir \(entry.projectName) en Work") { model.openProject(entry.projectKey) }
                .font(.subheadline.weight(.semibold))
                .tint(WindowStyle.information)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(WindowStyle.paper, in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private func actions(_ entry: AkteEntry) -> some View {
        let busy = model.deciding.contains(entry.id)
        HStack(spacing: 8) {
            switch entry.kind {
            case .frist, .entscheidung:
                WindowPrimaryButton(title: "Bestätigen") { Task { await model.decide(entry, .confirm) } }
                WindowSecondaryButton(title: "Verwerfen") { Task { await model.decide(entry, .reject) } }
            case .aufgabe:
                WindowPrimaryButton(title: "Als Aufgabe anlegen") { Task { await model.decide(entry, .makeTask) } }
                WindowSecondaryButton(title: "Verwerfen") { Task { await model.decide(entry, .reject) } }
            case .widerspruch:
                WindowPrimaryButton(title: "Geklärt") { Task { await model.decide(entry, .resolve) } }
                WindowSecondaryButton(title: "Kein Widerspruch") { Task { await model.decide(entry, .reject) } }
            }
        }
        .disabled(busy)
        .opacity(busy ? 0.5 : 1)
    }
}
