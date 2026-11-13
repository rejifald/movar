//
//  MovarRow.swift
//  Shared (App) / MovarKit
//

import SwiftUI

/// One row API for every list row in the app.
///
/// Build one with a variant: `.nav`, `.toggle`, `.choice`, `.action`,
/// `.reorder`, `.add`. Every row is at least `MovarMetrics.Control.regular`
/// tall and its whole width is the hit target.
struct MovarRow: View {

    private enum Kind {
        case nav(value: String?)
        case toggle(subtitle: String?, isOn: Binding<Bool>)
        case choice(subtitle: String?, selected: Bool, action: () -> Void)
        case action(() -> Void)
        case reorder(index: Int, onRemove: (() -> Void)?, onMoveUp: (() -> Void)?, onMoveDown: (() -> Void)?)
        case add(() -> Void)
    }

    private let title: String
    private let kind: Kind

    private init(_ title: String, _ kind: Kind) {
        self.title = title
        self.kind = kind
    }

    // MARK: Variants

    /// Label + current value. The chevron is the enclosing `NavigationLink`'s on
    /// iOS and the selection highlight in the macOS sidebar, so none is drawn here.
    static func nav(_ title: String, value: String? = nil) -> MovarRow {
        MovarRow(title, .nav(value: value))
    }

    static func toggle(_ title: String, subtitle: String? = nil, isOn: Binding<Bool>) -> MovarRow {
        MovarRow(title, .toggle(subtitle: subtitle, isOn: isOn))
    }

    /// A single-choice row: a checkmark in `brandText` while selected.
    static func choice(
        _ title: String, subtitle: String? = nil, selected: Bool, action: @escaping () -> Void
    ) -> MovarRow {
        MovarRow(title, .choice(subtitle: subtitle, selected: selected, action: action))
    }

    /// A row that does something: `brandText`, semibold.
    static func action(_ title: String, action: @escaping () -> Void) -> MovarRow {
        MovarRow(title, .action(action))
    }

    /// A numbered, removable, reorderable row. `index` is the number SHOWN
    /// (1-based). `onRemove == nil` draws NO minus and offers no remove action
    /// (the last remaining item cannot be removed). Reordering by drag is the list's `onMove`; `onMoveUp` /
    /// `onMoveDown` only surface as VoiceOver actions.
    static func reorder(
        index: Int, _ title: String, onRemove: (() -> Void)?,
        onMoveUp: (() -> Void)? = nil, onMoveDown: (() -> Void)? = nil
    ) -> MovarRow {
        MovarRow(title, .reorder(index: index, onRemove: onRemove, onMoveUp: onMoveUp, onMoveDown: onMoveDown))
    }

    /// An «add» row: green plus, title.
    static func add(_ title: String, action: @escaping () -> Void) -> MovarRow {
        MovarRow(title, .add(action))
    }

    // MARK: Body

    var body: some View {
        switch kind {
        case .nav(let value):
            navRow(value)
        case .toggle(let subtitle, let isOn):
            Toggle(isOn: isOn) { titleBlock(subtitle) }
                .frame(minHeight: MovarMetrics.Control.regular)
        case .choice(let subtitle, let selected, let action):
            Button(action: action) {
                HStack {
                    titleBlock(subtitle)
                    Spacer(minLength: MovarMetrics.Space.xs)
                    if selected {
                        Image(systemName: "checkmark").foregroundColor(MovarPalette.brandText)
                    }
                }
                .rowChrome()
            }
            .buttonStyle(PlainButtonStyle())
            .accessibilityAddTraits(selected ? .isSelected : [])
        case .action(let action):
            Button(action: action) {
                Text(title)
                    .font(Font.body.weight(.semibold))
                    .foregroundColor(MovarPalette.brandText)
                    .rowChrome()
            }
            .buttonStyle(PlainButtonStyle())
        case .reorder(let index, let onRemove, let onMoveUp, let onMoveDown):
            reorderRow(index: index, onRemove: onRemove, onMoveUp: onMoveUp, onMoveDown: onMoveDown)
        case .add(let action):
            Button(action: action) {
                HStack(spacing: MovarMetrics.Space.sm) {
                    Image(systemName: "plus.circle.fill").foregroundColor(MovarPalette.brandFill)
                    Text(title).foregroundColor(MovarPalette.label)
                }
                .rowChrome()
            }
            .buttonStyle(PlainButtonStyle())
        }
    }

    private func titleBlock(_ subtitle: String?) -> some View {
        VStack(alignment: .leading, spacing: MovarMetrics.Space.xxs) {
            Text(title).foregroundColor(MovarPalette.label)
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundColor(MovarPalette.secondaryLabel)
            }
        }
    }

    /// The value truncates before the title wraps.
    private func navRow(_ value: String?) -> some View {
        HStack(spacing: MovarMetrics.Space.sm) {
            Text(title)
                .foregroundColor(MovarPalette.label)
                .layoutPriority(1)
            Spacer(minLength: MovarMetrics.Space.xs)
            if let value = value {
                Text(value)
                    .foregroundColor(MovarPalette.secondaryLabel)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        .rowChrome()
        .accessibilityElement(children: .combine)
    }

    private func reorderRow(
        index: Int, onRemove: (() -> Void)?,
        onMoveUp: (() -> Void)?, onMoveDown: (() -> Void)?
    ) -> some View {
        let removeLabel = HostStrings.movarKitRemove(title)
        return HStack(spacing: MovarMetrics.Space.sm) {
            if let onRemove = onRemove {
                Button(action: onRemove) {
                    Image(systemName: "minus.circle.fill").foregroundColor(MovarPalette.danger)
                }
                .buttonStyle(PlainButtonStyle())
            }
            Text("\(index)").foregroundColor(MovarPalette.secondaryLabel)
            Text(title).foregroundColor(MovarPalette.label)
            Spacer(minLength: 0)
        }
        .rowChrome()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(index), \(title)"))
        .optionalAction(removeLabel, onRemove)
        .optionalAction(HostStrings.movarKitMoveUp, onMoveUp)
        .optionalAction(HostStrings.movarKitMoveDown, onMoveDown)
    }
}

private extension View {

    /// Full-width, at least a regular control tall, and hittable everywhere.
    func rowChrome() -> some View {
        self
            .frame(maxWidth: .infinity, minHeight: MovarMetrics.Control.regular, alignment: .leading)
            .contentShape(Rectangle())
    }

    @ViewBuilder
    func optionalAction(_ name: String, _ handler: (() -> Void)?) -> some View {
        if let handler = handler {
            self.accessibilityAction(named: Text(name), handler)
        } else {
            self
        }
    }
}
