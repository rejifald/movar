//
//  AuditReportView.swift
//  Shared (App)
//
//  The language conformance report — its own screen, not a result panel.
//

import SwiftUI

/// The report a Movar Audit produces, as a document.
///
/// A headline count, what could not be checked, how the site answered, the
/// findings, and the full rule list. Rendering it inline under the composer made
/// it read as the output of a form; it is the artifact the whole tool exists to
/// produce, and an advocate reads it top to bottom.
///
/// THIS VIEW DECIDES NOTHING. Every verdict, count and downgrade already
/// happened inside `evaluate()`, the same pure kernel the CLI runs — which is
/// what lets the site being named re-run the evidence and get this same page
/// back, and what makes it safe for a native renderer to exist at all.
///
/// Three structural decisions carry most of the readability, all three inherited
/// from the React report rather than re-litigated:
///
/// - **One card per rule, not per finding.** A rule reports once per page, so a
///   five-page site turns twelve problems into forty near-identical cards
///   distinguishable only by a URL. Grouping states the problem once and lists
///   the pages under it, which is how a reader would say it out loud: "this is
///   wrong, on these two pages".
/// - **Findings are sectioned by catalogue family.** The composer promises three
///   questions — what the site declares, what it actually serves, whether its
///   switcher works — and a flat list answers none of them. The families come
///   from the engine (`catalogue.describe`), so the document's spine is the
///   catalogue's rather than a second taxonomy invented here.
/// - **Coverage is always open.** This is the half of the report that says what
///   was NOT established, and burying it behind a disclosure made the headline
///   count look like the whole story — the exact failure mode "`not-collected` is
///   never a pass" exists to prevent.
///
/// WHAT THE PLATFORM GAVE FOR FREE. `DisclosureGroup` replaces `<details>` and
/// brings the rotation, the hit target and the VoiceOver expand/collapse action;
/// a `Menu` replaces the wrapping row of filter pills, which on a 390pt phone had
/// started hiding its own last two options; `List` sections replace hand-built
/// cards; and the label-and-value row `List` draws for a two-element `HStack` is
/// the response matrix, which the web had to build as a real `<table>` to stop
/// each row sizing its own columns.
struct AuditReportView: View {

    let run: AuditRun
    @ObservedObject var model: AuditModel
    /// macOS's way back, since there is no navigation stack there. `nil` on iOS,
    /// where the push draws its own.
    let onBack: (() -> Void)?

    @State private var filter: RuleVerdict?
    @State private var exportState: ExportState = .idle

    private enum ExportState: Equatable {
        case idle
        case busy
        case failed
    }

    private var report: AuditReport { run.outcome.report }

    var body: some View {
        content
            .movarPushedTitle(AuditModel.hostOf(run.target))
    }

    @ViewBuilder
    private var content: some View {
#if os(macOS)
        VStack(alignment: .leading, spacing: 0) {
            if let onBack = onBack {
                Button(action: onBack) {
                    Label(HostStrings.auditBack, systemImage: "chevron.left")
                }
                .movarRowButtonStyle()
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                Divider()
            }
            list
        }
#else
        list
#endif
    }

    private var list: some View {
        // A reader who jumps from a coverage row to a finding is following an
        // INDEX: the row says "this rule found 2 things" and the card above says
        // what they were. Without the scroll the button would be a promise the
        // screen declines to keep. The proxy is handed straight down rather than
        // parked in `@State`, so there is never a frame where a row holds a
        // proxy belonging to a `List` that has been rebuilt.
        ScrollViewReader { scroller in
            List {
                verdictSection
                actionsSection
                matrixSection
                findingSections
                observationSections
                rulesSection(scroller)
            }
            .movarListStyle()
        }
    }

    // MARK: - The verdict

    /// The headline, and the coverage line that qualifies it.
    ///
    /// ONE PANEL, because "0 broken promises" must never be readable apart from
    /// "…and N rules could not run". The count is the largest thing on the screen
    /// because it is the one number the document exists to produce — and it is a
    /// COUNT, never a score: weights would be arguments that cannot be won, and a
    /// single number would laminate facts onto judgements.
    ///
    /// Sits on the grouped background rather than in a card, the way `AboutView`'s
    /// masthead does, so it reads as the document's headline instead of as the
    /// first row of a list.
    private var verdictSection: some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: AuditVerdictStyle.headlineSymbol(for: report))
                    .font(.title)
                    .foregroundColor(AuditVerdictStyle.headlineTint(for: report))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(AuditVerdictStyle.headline(for: report))
                        .font(.title2)
                        .fontWeight(.semibold)
                    Text(
                        HostStrings.auditCoverage(
                            report.coverage.ran, report.coverage.rules,
                            report.coverage.notCollected)
                    )
                    .font(.footnote)
                    .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
            .movarPlainRow()
        }
    }

    // MARK: - Actions

    /// Re-run and export, as two rows.
    ///
    /// STACKED, not side by side: two buttons on one line read as a single split
    /// control, and the app is one narrow column everywhere it runs. As list rows
    /// they are also full-width hit targets, which two inline buttons were not.
    ///
    /// Re-running keeps the old report in the list rather than overwriting it, so
    /// the two can be compared — either to confirm a fix landed, or to see
    /// whether anything moved.
    @ViewBuilder
    private var actionsSection: some View {
        Section {
            Button {
                model.run(target: run.target)
            } label: {
                Label(
                    model.isRunning ? HostStrings.auditRunning : HostStrings.auditAgain,
                    systemImage: "arrow.clockwise")
            }
            .movarRowButtonStyle()
            .disabled(model.isRunning)

            Button(action: exportReport) {
                Label(HostStrings.auditExport, systemImage: "square.and.arrow.up")
            }
            .movarRowButtonStyle()
            .disabled(exportState == .busy)
        } footer: {
            VStack(alignment: .leading, spacing: 8) {
                if exportState == .failed {
                    Text(HostStrings.auditExportUnavailable)
                }
                // `not-collected` is never a pass. This tier collects no rendered
                // DOM and follows no declared targets, so a good part of the
                // catalogue could not run — saying so on the report's face is the
                // point.
                if report.coverage.notCollected > 0 {
                    Text(HostStrings.auditNotCollectedNote)
                }
            }
        }
    }

    /// Render the artifact in the engine, then hand it to the system to keep.
    ///
    /// The document is built by `@movar/audit`, not here: it is one self-contained
    /// HTML file carrying the readable report, the embedded evidence and the
    /// replay command, and the CLI and every shell have to emit the same bytes.
    private func exportReport() {
        exportState = .busy
        model.renderArtifact(for: run) { html in
            guard let html = html else {
                exportState = .failed
                return
            }
            HostActions.exportReport(
                filename: Self.artifactFilename(target: run.target, ranAt: run.ranAt), html: html
            ) { outcome in
                // Cancelling is not an error worth shouting about — only a
                // refusal to even offer the sheet is.
                if case .unavailable = outcome {
                    exportState = .failed
                } else {
                    exportState = .idle
                }
            }
        }
    }

    // MARK: - How the site answered

    /// The response matrix: what each leg asked for and what came back.
    ///
    /// Before the findings, because it is the behaviour they interpret. A reader
    /// who sees "you asked for Ukrainian and got Russian" reads every finding
    /// below as a conclusion rather than an assertion.
    ///
    /// The MECHANISM deliberately does not reach the screen — no status codes, no
    /// redirect chain, no path segments — see `MatrixLeg`.
    @ViewBuilder
    private var matrixSection: some View {
        let legs = run.outcome.evidence.legs
        if !legs.isEmpty {
            Section {
                ForEach(legs) { leg in
                    HStack(alignment: .firstTextBaseline) {
                        Text(
                            leg.acceptLanguage.map(HostSettings.languageName)
                                ?? HostStrings.auditMatrixNoPreference)
                        Spacer(minLength: 12)
                        Text(servedLabel(leg))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.trailing)
                    }
                    .accessibilityElement(children: .combine)
                }
                // No screenshot exists and none can: this collector parses HTML
                // inertly and never renders a pixel. Offering the live site is
                // the honest substitute, and the label says where it goes.
                Button {
                    HostActions.openAuditedSite(run.target)
                } label: {
                    Label(HostStrings.auditMatrixOpenSite, systemImage: "arrow.up.forward.app")
                }
                .movarRowButtonStyle()
            } header: {
                Text(HostStrings.auditMatrixTitle)
            } footer: {
                // The one thing the columns cannot say: the ADDRESS never
                // changed. Without it the table is five results; with it, it is a
                // controlled experiment with one variable.
                movarUnhyphenated(HostStrings.auditMatrixIntro)
            }
        }
    }

    /// What one leg came back with, in a reader's words.
    ///
    /// Four outcomes and no numbers: the site did not answer, it answered with an
    /// error, it answered without declaring a language, or it served one. The
    /// error case is why a leg still carries a status this screen never prints —
    /// a 404 page declaring `lang="uk"` would otherwise be reported as the site
    /// serving Ukrainian to that preference, which is a false statement about a
    /// named company.
    private func servedLabel(_ leg: MatrixLeg) -> String {
        if !leg.answered { return HostStrings.auditMatrixNoAnswer }
        if leg.status >= 400 { return HostStrings.auditMatrixErrored }
        guard let served = leg.served else { return HostStrings.auditMatrixUndeclared }
        return HostSettings.languageName(served)
    }

    // MARK: - Findings

    /// The scored findings — broken promises and warnings.
    ///
    /// NO EMPTY STATE. "Nothing was found" was already said, larger, by the panel
    /// at the top — and it read as a contradiction whenever a report had no
    /// failures but did have observations, which render right below it. An absent
    /// section is the correct way to show an absence.
    @ViewBuilder
    private var findingSections: some View {
        let sections = groupedSections { $0.verdict.isHeadline }
        if !sections.isEmpty {
            ForEach(sections, id: \.family) { section in
                Section {
                    ForEach(section.groups, id: \.rule) { group in
                        AuditFindingCard(group: group)
                            .id(Self.anchor(for: group.rule))
                    }
                } header: {
                    Text(sectionHeading(HostStrings.auditFindings, section))
                }
            }
        }
    }

    /// Everything else the rules said. Shown, but in its own group.
    ///
    /// Never scored — the headline is a count of `fail` findings alone — but
    /// dropping them would be worse than not running the rule. The clearest case
    /// is `core/content-language-mixed`: Russian body text on a page declaring
    /// Ukrainian is exactly what Movar's readers came to see, and it is an
    /// observation precisely BECAUSE a classifier answered rather than a
    /// declaration. The rule is "observations are cited, never scored", not
    /// "observations are hidden".
    @ViewBuilder
    private var observationSections: some View {
        let sections = groupedSections {
            $0.verdict.isObserved && $0.rule != Self.defaultLanguageRule
        }
        if !sections.isEmpty {
            ForEach(sections, id: \.family) { section in
                Section {
                    ForEach(section.groups, id: \.rule) { group in
                        AuditFindingCard(group: group)
                            .id(Self.anchor(for: group.rule))
                    }
                } header: {
                    Text(sectionHeading(HostStrings.auditObservations, section))
                } footer: {
                    if section.id == sections.last?.id {
                        Text(HostStrings.auditObservationsNote)
                    }
                }
            }
        }
    }

    /// The block's name, then the family's — "Findings · What it actually serves".
    ///
    /// One header per section, because `List` gives a section exactly one and the
    /// document needs both facts: which half of the report this is, and which of
    /// the composer's three questions it answers. The block name is dropped after
    /// the first section so the eye is not re-told on every heading.
    private func sectionHeading(_ block: String, _ section: FamilySection) -> String {
        guard let family = HostStrings.auditFamilyTitle(section.family) else { return block }
        return section.isFirst ? "\(block) · \(family)" : family
    }

    // MARK: - Every rule

    /// The full catalogue, with what happened to each entry.
    ///
    /// An INDEX, not a second copy of the findings: a rule that already has a card
    /// above shows its count and a way back to it, and states its own sentence
    /// only when this list is the only place it appears.
    /// The colophon rides this section's footer, which is the bottom of the
    /// document — what someone needs on RETURNING to a report, not while reading
    /// one. A report with no stamp says so: filling in this app's version would
    /// name a build that judged nothing, in the one line a reader uses to find
    /// the code that judged.
    private func rulesSection(_ scroller: ScrollViewProxy) -> some View {
        Section {
            filterMenu
            ForEach(visibleResults, id: \.rule) { result in
                AuditRuleRow(
                    result: result,
                    anchor: anchor(for: result),
                    onJump: { anchor in
                        withAnimation { scroller.scrollTo(anchor, anchor: .top) }
                    })
            }
        } header: {
            Text(HostStrings.auditAllRules)
        } footer: {
            Text(
                HostStrings.auditEngine(
                    report.engine.map { "\($0.id) \($0.version)" } ?? HostStrings.auditEngineUnknown)
            )
        }
    }

    /// The filter, as a menu rather than a row of pills.
    ///
    /// The web bar wrapped, and on a 390pt phone a strip of six pills hid its own
    /// last two options behind an invisible scrollbar. A menu is what iOS uses to
    /// filter a long list, it states the ACTIVE filter on its own row so the list
    /// below can never look mysteriously short, and it carries each option's count
    /// — which was always the useful part of a pill.
    ///
    /// Only verdicts this report actually produced are offered. A fixed set would
    /// show "failed 0" on a clean site, and an empty filter is a dead control.
    private var filterMenu: some View {
        Menu {
            Button {
                filter = nil
            } label: {
                Label(
                    "\(HostStrings.auditFilterAll) (\(report.results.count))",
                    systemImage: filter == nil ? "checkmark" : "")
            }
            ForEach(RuleVerdict.ranked.filter { counts[$0] != nil }, id: \.self) { verdict in
                Button {
                    filter = verdict
                } label: {
                    Label(
                        "\(HostStrings.auditVerdict(verdict)) (\(counts[verdict] ?? 0))",
                        systemImage: filter == verdict ? "checkmark" : "")
                }
            }
        } label: {
            HStack {
                Text(HostStrings.auditFilterLabel)
                Spacer(minLength: 12)
                Text(activeFilterLabel)
                    .foregroundColor(.secondary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .contentShape(Rectangle())
        }
        .movarRowButtonStyle()
    }

    private var activeFilterLabel: String {
        guard let filter = filter else {
            return "\(HostStrings.auditFilterAll) (\(report.results.count))"
        }
        return "\(HostStrings.auditVerdict(filter)) (\(counts[filter] ?? 0))"
    }

    // MARK: - Derivations

    /// The one rule the response matrix renders in full, so it gets no card.
    ///
    /// It is the kernel's own baseline — "the default every other serving finding
    /// reads against" — and its entire content is "the leg that stated no
    /// preference came back in language X". The matrix's first row says exactly
    /// that, in context with the other legs, which is strictly more informative
    /// than a card repeating it alone. Nothing is dropped: its sentence stays
    /// reachable in its own coverage row, and the exported artifact — rendered by
    /// `@movar/audit`, not by this screen — is untouched either way.
    ///
    /// A DISPLAY decision, not an adjudication: no verdict, count or kernel
    /// sentence changes.
    private static let defaultLanguageRule = "core/serving-default-language"

    /// Which rules got a card. Those coverage rows become index entries.
    private var cardedRules: Set<String> {
        Set(report.findings.map(\.rule).filter { $0 != Self.defaultLanguageRule })
    }

    /// Where a coverage row jumps: its own card, or nowhere.
    ///
    /// The default-language rule is deliberately absent from the carded set — the
    /// matrix renders it, and the matrix is above the findings, so a row pointing
    /// there would scroll the reader backwards past everything.
    private func anchor(for result: RuleResult) -> String? {
        cardedRules.contains(result.rule) ? Self.anchor(for: result.rule) : nil
    }

    private static func anchor(for rule: String) -> String { "finding-\(rule)" }

    private var counts: [RuleVerdict: Int] {
        Dictionary(report.results.map { ($0.verdict, 1) }, uniquingKeysWith: +)
    }

    /// Worst first, then fine, then "did not even apply"; ties keep the
    /// catalogue's order, because two runs of the same site must produce the same
    /// document.
    private var visibleResults: [RuleResult] {
        let ranked = report.results.enumerated().sorted { left, right in
            let leftRank = RuleVerdict.ranked.firstIndex(of: left.element.verdict) ?? .max
            let rightRank = RuleVerdict.ranked.firstIndex(of: right.element.verdict) ?? .max
            if leftRank != rightRank { return leftRank < rightRank }
            return left.offset < right.offset
        }.map(\.element)
        guard let filter = filter else { return ranked }
        return ranked.filter { $0.verdict == filter }
    }

    /// One catalogue family's worth of grouped findings.
    private struct FamilySection: Identifiable {
        let family: String
        let groups: [AuditRuleGroup]
        /// First section of its block, so only it repeats the block's name.
        let isFirst: Bool
        var id: String { family }
    }

    /// Collapse the matching findings into one group per rule, then split them
    /// into catalogue-ordered family sections.
    ///
    /// Rule order is the kernel's, not a re-sort: `report.findings` is already
    /// flattened in rule order. Family order is the engine's catalogue, so a
    /// family this build has never heard of sorts last and renders its cards
    /// without a heading rather than with an empty one.
    private func groupedSections(_ include: (Finding) -> Bool) -> [FamilySection] {
        var order: [String] = []
        var byRule: [String: [Finding]] = [:]
        for finding in report.findings where include(finding) {
            if byRule[finding.rule] == nil {
                byRule[finding.rule] = []
                order.append(finding.rule)
            }
            byRule[finding.rule]?.append(finding)
        }

        let families = model.catalogue
        let familyOfRule = Dictionary(
            families.flatMap { family in family.rules.map { ($0, family.id) } },
            uniquingKeysWith: { first, _ in first })
        let familyRank = Dictionary(
            families.enumerated().map { ($0.element.id, $0.offset) },
            uniquingKeysWith: { first, _ in first })

        var byFamily: [String: [AuditRuleGroup]] = [:]
        var familyOrder: [String] = []
        for rule in order {
            guard let findings = byRule[rule] else { continue }
            let family = familyOfRule[rule] ?? ""
            if byFamily[family] == nil {
                byFamily[family] = []
                familyOrder.append(family)
            }
            byFamily[family]?.append(
                AuditRuleGroup(
                    rule: rule, verdict: Self.worstVerdict(findings), findings: findings,
                    title: title(for: rule)))
        }

        // Tie-broken on first-seen position, because `sorted(by:)` is not stable
        // and two families this build has never heard of would both rank `.max`.
        // "Two runs of the same site produce the same document" is the invariant
        // that lets a site owner re-run the evidence and argue with the result —
        // it does not survive a section order that depends on the sort's mood.
        return familyOrder
            .enumerated()
            .sorted { left, right in
                let leftRank = familyRank[left.element] ?? .max
                let rightRank = familyRank[right.element] ?? .max
                if leftRank != rightRank { return leftRank < rightRank }
                return left.offset < right.offset
            }
            .enumerated()
            .map { index, entry in
                FamilySection(
                    family: entry.element, groups: byFamily[entry.element] ?? [],
                    isFirst: index == 0)
            }
    }

    /// The rule's title in the reader's language, falling back to the kernel's.
    ///
    /// A `Finding` carries only its rule ID; the English title lives on the
    /// matching `RuleResult`.
    private func title(for rule: String) -> String {
        let english = report.results.first { $0.rule == rule }?.title ?? rule
        return HostStrings.auditRuleTitle(rule) ?? english
    }

    /// The verdict a grouped card carries: the most serious one inside it.
    private static func worstVerdict(_ findings: [Finding]) -> FindingVerdict {
        findings.min {
            (FindingVerdict.ranked.firstIndex(of: $0.verdict) ?? .max)
                < (FindingVerdict.ranked.firstIndex(of: $1.verdict) ?? .max)
        }?.verdict ?? .info
    }
}

// MARK: - Grouped findings

/// Every finding one rule reported, plus the worst verdict among them.
struct AuditRuleGroup {
    let rule: String
    let verdict: FindingVerdict
    let findings: [Finding]
    /// Already resolved to the reader's language by the screen that built this.
    let title: String
}

/// One rule's findings, as a single disclosure.
///
/// Leads with a verdict WORD, not just a colour: "we could not check this" and
/// "this failed" must never be separable only by hue. The rule ID is the citable
/// handle a site owner needs to argue back — indispensable, but reference
/// material, so it lives inside the disclosure rather than competing with the
/// sentence for the top line.
struct AuditFindingCard: View {

    let group: AuditRuleGroup

    var body: some View {
        DisclosureGroup {
            detail
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: AuditVerdictStyle.symbol(for: group.verdict))
                        .foregroundColor(AuditVerdictStyle.tint(for: group.verdict))
                        .accessibilityHidden(true)
                    Text(HostStrings.auditFindingVerdict(group.verdict))
                        .font(.subheadline)
                        .foregroundColor(AuditVerdictStyle.tint(for: group.verdict))
                    // Only worth saying when there is more than one: "on 1 page"
                    // next to a single URL is noise.
                    if subjects.count > 1 {
                        Text("· " + HostStrings.auditPageCount(subjects.count))
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                movarUnhyphenated(group.title)
                // An unscored card's title is a QUESTION — "what language loads
                // with no stated preference" — and the answer is the kernel's own
                // measurement. Leaving that behind the disclosure made these
                // cards read as a shrug. A scored card needs no such promotion:
                // its title already states what is wrong.
                if group.verdict.isObserved {
                    ForEach(measurements, id: \.self) { measurement in
                        Text(measurement)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                }
                if showSubjects {
                    ForEach(subjects, id: \.self) { subject in
                        Text(subject)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }
                if let citation = citation {
                    Label(
                        "\(citation.source) — \(citation.article)",
                        systemImage: "building.columns")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 2)
        }
    }

    /// The reference block: the rule's ID, and every finding's own sentence.
    private var detail: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuditDetailRow(label: HostStrings.auditDetailRule, value: group.rule, isCode: true)
            ForEach(Array(group.findings.enumerated()), id: \.offset) { _, finding in
                // One rule reporting once needs no per-finding heading; several
                // do, or the reader cannot tell which page each sentence is
                // about.
                if subjects.count > 1, let subject = finding.subject.display {
                    AuditDetailRow(
                        label: HostStrings.auditDetailPage, value: subject, isCode: true)
                }
                AuditDetailRow(
                    label: HostStrings.auditDetailFinding, value: finding.summary)
                AuditDetailRow(
                    label: HostStrings.auditDetailBasis,
                    value: HostStrings.auditGrounding(finding.grounding)
                        // A downgraded finding says so rather than quietly
                        // softening: the kernel stripped its failing power
                        // because a classifier, not a declaration, answered.
                        + (finding.downgradedFrom == nil
                            ? "" : " · " + HostStrings.auditDowngraded))
                if let denominator = finding.denominator {
                    // "3 of 340 text nodes" is a finding; "3 nodes" is a smear.
                    AuditDetailRow(
                        label: HostStrings.auditDetailDenominator,
                        value: HostStrings.auditDenominator(
                            denominator.matched, denominator.examined))
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// The pages this rule reported on, deduplicated.
    ///
    /// A rule can report the same page twice (once per inventory source, say),
    /// and printing the URL twice under "on 4 pages" states a number about this
    /// site that is simply false.
    private var subjects: [String] {
        var seen = Set<String>()
        return group.findings.compactMap(\.subject.display).filter { seen.insert($0).inserted }
    }

    /// Deduplicated for the same reason: two pages that measured identically
    /// produce the identical sentence, and printing it twice looks like two
    /// findings where there is one fact.
    private var measurements: [String] {
        var seen = Set<String>()
        return group.findings.map(\.summary).filter { seen.insert($0).inserted }
    }

    /// A scored card always shows its pages; an unscored one shows them only when
    /// its measurement cannot name them itself, which is what a second page means.
    private var showSubjects: Bool {
        if subjects.isEmpty { return false }
        return !(group.verdict.isObserved && subjects.count < 2)
    }

    /// Every finding of a rule carries the same citation (the kernel stamps it
    /// from the rule), so the card states it once.
    private var citation: Citation? {
        group.findings.compactMap(\.citation).first
    }
}

// MARK: - One rule in the coverage list

/// One catalogue entry and what happened to it.
///
/// EVERY ROW OPENS, including the passes. One interaction for all thirty-five
/// rather than "tappable if it found something, inert otherwise" — a list where
/// only some rows respond teaches the reader that the quiet ones hold nothing,
/// which is exactly backwards for the eight that say "not checked".
struct AuditRuleRow: View {

    let result: RuleResult
    /// The card this rule's findings are in, when it has one.
    let anchor: String?
    let onJump: (String) -> Void

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 10) {
                if let why = whyLine {
                    movarUnhyphenated(why).font(.footnote)
                }
                // Every finding's own sentence stays reachable on screen. A rule
                // whose card was folded into the matrix has nowhere else to keep
                // its, so its row carries it.
                if anchor == nil {
                    ForEach(Array(result.findings.enumerated()), id: \.offset) { _, finding in
                        AuditDetailRow(
                            label: HostStrings.auditDetailFinding, value: finding.summary)
                    }
                }
                AuditDetailRow(
                    label: HostStrings.auditDetailBasis,
                    value: HostStrings.auditGrounding(result.grounding))
                AuditDetailRow(
                    label: HostStrings.auditDetailRule, value: result.rule, isCode: true)
                if let anchor = anchor {
                    Button {
                        onJump(anchor)
                    } label: {
                        Label(HostStrings.auditGoToFindings, systemImage: "arrow.up")
                            .font(.footnote)
                    }
                    .movarRowButtonStyle()
                }
            }
            .padding(.vertical, 4)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                movarUnhyphenated(title)
                Spacer(minLength: 8)
                // ONE STATUS TOKEN: glyph and word together, in that order, as a
                // single thing the eye reads once. The word is the part that must
                // survive — "we did not check this" may never be readable as
                // "this is fine", and a glyph alone leaves that to a guess.
                HStack(spacing: 4) {
                    Image(systemName: AuditVerdictStyle.symbol(for: result.verdict))
                        .accessibilityHidden(true)
                    Text(
                        result.findings.isEmpty
                            ? HostStrings.auditVerdict(result.verdict)
                            : HostStrings.auditFindingCount(result.findings.count)
                    )
                }
                .font(.footnote)
                .foregroundColor(AuditVerdictStyle.tint(for: result.verdict))
            }
        }
    }

    private var title: String {
        HostStrings.auditRuleTitle(result.rule) ?? result.title
    }

    /// Why a rule landed where it did, in the reader's language.
    ///
    /// `evaluate()` records this per rule and the web report used to drop it, so
    /// a row could say "not checked" with no way to learn what was missing — the
    /// single thing a reader deciding whether to rely on this document most
    /// needs. `nil` for a rule that reported findings: its card says it better,
    /// and the row links there instead.
    private var whyLine: String? {
        guard result.findings.isEmpty else { return nil }
        switch result.verdict {
        case .notCollected:
            let missing = (result.missingCapabilities ?? []).map(HostStrings.auditCapability)
            // A `not-collected` rule always names at least one missing
            // capability, but an older stored bundle might not — better a bare
            // verdict than an ungrammatical sentence with a hole in it.
            guard !missing.isEmpty else { return nil }
            return HostStrings.auditWhyNotCollected(Self.listOf(missing))
        case .notApplicable:
            return result.notApplicableReason.map(HostStrings.auditWhyNotApplicable)
        case .unknown:
            return nil
        default:
            return HostStrings.auditWhyPassed
        }
    }

    /// "a, b and c" — the join the why-sentence reads with.
    private static func listOf(_ parts: [String]) -> String {
        guard parts.count > 1, let last = parts.last else { return parts.first ?? "" }
        return parts.dropLast().joined(separator: ", ") + HostStrings.auditListAnd + last
    }
}

// MARK: - Shared pieces

/// One `label: value` pair inside a disclosure.
///
/// Stacked rather than side by side, because the values are sentences and URLs —
/// a two-column layout would set a full paragraph in half the width of a phone.
struct AuditDetailRow: View {

    let label: String
    let value: String
    /// Domains, rule IDs and URLs are literal strings rather than prose, and the
    /// web report set them in mono to say so.
    var isCode = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            if isCode {
                // `.system(.footnote, design:)` rather than
                // `.footnote.monospaced()`, which is macOS 12; this app's floor
                // is 11.
                Text(value).font(.system(.footnote, design: .monospaced))
            } else {
                movarUnhyphenated(value).font(.footnote)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// How a verdict looks, in one place.
///
/// Glyph and tint together, because they always have to agree: a `not-collected`
/// rule gets its OWN mark rather than sharing the pass tick — "we did not check
/// this" must never look like "this is fine", which is the default failure mode
/// of every audit tool.
///
/// The colours are the SYSTEM's, not the brand's. Red and orange are what iOS
/// and macOS already mean by "wrong" and "careful", including in the high-contrast
/// and colour-blind accommodations the system ships; the brand accent is the tint
/// of things you can press, and spending it on a verdict would make a failure
/// look like a button. Green is the exception in one direction only — a clean
/// report — and every one of these is paired with a word, so hue is never the
/// only carrier.
enum AuditVerdictStyle {

    static func symbol(for verdict: RuleVerdict) -> String {
        switch verdict {
        case .fail: return "exclamationmark.triangle.fill"
        case .warn: return "exclamationmark.circle"
        case .notCollected: return "shield.lefthalf.fill"
        case .notApplicable: return "minus.circle"
        case .pass: return "checkmark.circle"
        case .unknown: return "questionmark.circle"
        }
    }

    static func tint(for verdict: RuleVerdict) -> Color {
        switch verdict {
        case .fail: return .red
        case .warn: return .orange
        case .pass: return .green
        case .notCollected, .notApplicable, .unknown: return .secondary
        }
    }

    /// Mirrors the rule glyphs, so a finding and its coverage row are
    /// recognisably the same thing.
    static func symbol(for verdict: FindingVerdict) -> String {
        switch verdict {
        case .fail: return "exclamationmark.triangle.fill"
        case .warn: return "exclamationmark.circle"
        case .observation, .info: return "info.circle"
        case .unknown: return "questionmark.circle"
        }
    }

    static func tint(for verdict: FindingVerdict) -> Color {
        switch verdict {
        case .fail: return .red
        case .warn: return .orange
        case .observation, .info, .unknown: return .secondary
        }
    }

    // MARK: - The headline

    static func headline(for report: AuditReport) -> String {
        report.brokenPromises > 0
            ? HostStrings.auditBrokenPromises(report.brokenPromises)
            : HostStrings.auditNoBrokenPromises
    }

    static func headlineSymbol(for report: AuditReport) -> String {
        report.brokenPromises > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"
    }

    static func headlineTint(for report: AuditReport) -> Color {
        report.brokenPromises > 0 ? .red : .green
    }
}

// MARK: - Export naming

extension AuditReportView {

    /// The exported file's name: `movar-audit-<host>-<stamp>.html`.
    ///
    /// Built from the host and the run's own timestamp so a folder of exports
    /// sorts and reads sensibly. Everything outside a conservative character set
    /// is replaced rather than dropped, so two different targets can never
    /// collapse to one name and silently overwrite each other. `HostActions`
    /// re-validates before touching the filesystem — this side is convenience,
    /// not the safety boundary.
    static func artifactFilename(target: String, ranAt: Date) -> String {
        let stamp = DateFormatter()
        stamp.locale = Locale(identifier: "en_US_POSIX")
        stamp.timeZone = TimeZone(identifier: "UTC")
        // Seconds are enough to separate two runs a person made; milliseconds
        // only add noise to a name they will read in a folder listing.
        stamp.dateFormat = "yyyy-MM-dd'T'HH-mm-ss"
        return "movar-audit-\(slug(AuditModel.hostOf(target)))-\(stamp.string(from: ranAt)).html"
    }

    /// Lower-case, `[a-z0-9-]` only, collapsed — never empty.
    private static func slug(_ value: String) -> String {
        let parts = value.lowercased()
            .components(separatedBy: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789").inverted)
            .filter { !$0.isEmpty }
        return parts.isEmpty ? "report" : parts.joined(separator: "-")
    }
}
