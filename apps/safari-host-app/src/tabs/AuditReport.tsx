import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Gavel,
  Info,
  Minus,
  RotateCw,
  Share,
  ShieldQuestion,
} from 'lucide-react';
import { renderReportArtifact } from '@movar/audit/artifact';
import { CORE_RULESET, UA_PACK_FAMILIES } from '@movar/audit';
import type { Evidence, Finding, Report, RuleResult } from '@movar/audit';
import { makeLanguageDisplay } from '@movar/i18n';
import { cn } from '@movar/ui';
import { hostOf, prettyTarget } from '../audit/target';
import { exportReport, openAuditedSite } from '../bridge';
import { familyTitleFor, ruleTitleFor } from '../i18n';
import type { HostLocale, HostMessages } from '../i18n';

/**
 * The language conformance report — its own screen, not a result panel.
 *
 * A report is a **document**: a headline count, what could not be checked, the
 * findings, and the full rule list. Rendering it inline under the composer made
 * it read as the output of a form; it is the artifact the whole tool exists to
 * produce, and an advocate reads it top to bottom.
 *
 * This component renders a `Report` and decides nothing. Every verdict, count
 * and downgrade already happened inside `evaluate()`, the same pure kernel the
 * CLI runs — which is what lets the site being named re-run the evidence and
 * get this same page back.
 *
 * Two structural decisions carry most of the readability:
 *
 * - **One card per rule, not per finding.** A rule reports once per page, so a
 *   five-page site turns twelve problems into forty near-identical cards
 *   distinguishable only by a URL. Grouping states the problem once and lists
 *   the pages under it, which is also how a reader would say it out loud: "this
 *   is wrong, on these two pages".
 * - **Findings are sectioned by rule family.** The composer promises three
 *   questions — what the site declares, what it actually serves, whether its
 *   switcher works — and a flat list answers none of them. The families are the
 *   kernel's own grouping, so the document's spine is the catalogue's, not a
 *   second taxonomy invented here.
 */

/**
 * What a finding is about, in the order a reader wants it: the page, else the
 * build path, else the element. `undefined` when the finding is about the site
 * as a whole rather than any one place.
 *
 * Exported for its own tests: network evidence always carries a `url`, so the
 * later fallbacks are unreachable from this tab — but they are reachable from
 * the same `Finding` shape produced by filesystem evidence, and a renderer that
 * silently dropped them would be wrong the day the CLI's bundles are opened
 * here.
 */
export function subjectOf(finding: Finding): string | undefined {
  return finding.subject.url ?? finding.subject.path ?? finding.subject.node;
}

/** Findings worth leading with: the broken promises, then the warnings. */
const HEADLINE_VERDICTS: ReadonlySet<Finding['verdict']> = new Set(['fail', 'warn']);

/**
 * Everything else the rules said — shown, but in its own group.
 *
 * These are never scored (the headline is a count of `fail` findings alone),
 * but dropping them would be worse than not running the rule. The clearest case
 * is `core/content-language-mixed`: Russian body text on a page declaring
 * Ukrainian is exactly what Movar's readers came to see, and it is an
 * `observation` precisely BECAUSE a classifier answered rather than a
 * declaration. The ADR's rule is "observations are cited, never scored" — not
 * "observations are hidden".
 */
const OBSERVED_VERDICTS: ReadonlySet<Finding['verdict']> = new Set(['observation', 'info']);

/**
 * The verdicts whose card leads with the MEASUREMENT rather than the rule's
 * title. Same members as {@link OBSERVED_VERDICTS} and deliberately its own
 * constant: one answers "which group does this belong in", the other "does its
 * title state a fact or ask a question", and a future verdict could easily be
 * one without the other.
 */
const UNSCORED_VERDICTS: ReadonlySet<Finding['verdict']> = new Set(['observation', 'info']);

/**
 * One order for both the rows and the filter pills: worst first, then fine,
 * then "did not even apply".
 *
 * `not-collected` sits between the failures and the passes rather than at the
 * end. It is the audit saying it could not establish something, and ranking it
 * below "passed" would present the tool's own blind spots as the least
 * interesting outcome — the opposite of true for anyone deciding whether to
 * rely on this report. `not-applicable` genuinely is last: the rule did not
 * apply, so there is nothing to know.
 */
const VERDICT_ORDER: readonly RuleResult['verdict'][] = [
  'fail',
  'warn',
  'not-collected',
  'pass',
  'not-applicable',
];

/** Worst-first ranking among the verdicts one card can carry. */
const FINDING_VERDICT_ORDER: readonly Finding['verdict'][] = [
  'fail',
  'warn',
  'observation',
  'info',
];

/**
 * Rule ID → catalogue family ID, built from the kernel's own families.
 *
 * Includes the jurisdiction pack unconditionally: the map is a lookup, and a
 * report adjudicated without the pack simply never asks about those rules. The
 * alternative — threading the active ruleset down here — would make the report
 * depend on how it was produced in order to lay itself out.
 */
const FAMILY_OF_RULE: ReadonlyMap<string, string> = new Map(
  [...CORE_RULESET.families, ...UA_PACK_FAMILIES].flatMap((family) =>
    family.rules.map((rule) => [rule.id, family.id] as const),
  ),
);

/**
 * The one rule the response matrix renders in full, so it gets no card.
 *
 * It is the kernel's own baseline — "the default every other serving finding
 * reads against" — and its entire content is "the leg that stated no preference
 * came back in language X". The matrix's first row says exactly that, in
 * context with the other four legs, which is strictly more informative than a
 * card repeating it alone. Leaving both in made the observations section a
 * restatement of the table directly above it.
 *
 * Its plain sentence moves to the head of the matrix, and its coverage row
 * points there. Nothing is dropped: the kernel's own wording stays reachable in
 * that row's disclosure, and the exported artifact — rendered by
 * `@movar/audit`, not by this screen — is untouched either way.
 *
 * A DISPLAY decision, not an adjudication: no verdict, count or kernel sentence
 * changes, and the plain line derives from the same evidence a site owner would
 * re-run.
 */
const DEFAULT_LANGUAGE_RULE = 'core/serving-default-language';

/** Anchor for the matrix, which is where that rule's coverage row now points. */
const MATRIX_DOM_ID = 'audit-matrix';

/**
 * The status at which a response stops being an answer about language.
 *
 * A 404 page declaring `lang="uk"` is not the site serving Ukrainian to that
 * preference, so the matrix names the error instead of the error page's
 * language. The number never reaches the screen — see `matrix.errored`.
 */
const HTTP_ERROR_FLOOR = 400;

/** Catalogue order, so sections read A → F however the findings arrived. */
const FAMILY_ORDER: readonly string[] = [...CORE_RULESET.families, ...UA_PACK_FAMILIES].map(
  (family) => family.id,
);

/**
 * A stable DOM id per rule, so the coverage list can act as an index into the
 * findings above rather than restating them.
 *
 * Keyed by rule alone now that a rule gets one card: the id a coverage row
 * jumps to is the card carrying every one of that rule's findings.
 */
function cardDomId(rule: string): string {
  return `finding-${rule.replaceAll('/', '-')}`;
}

/** Where a coverage row jumps: its own card, the matrix, or nowhere. */
function anchorFor(rule: string, carded: ReadonlySet<string>): string | undefined {
  if (rule === DEFAULT_LANGUAGE_RULE) return MATRIX_DOM_ID;
  return carded.has(rule) ? cardDomId(rule) : undefined;
}

function rankedResults(results: readonly RuleResult[]): readonly RuleResult[] {
  const rank = (result: RuleResult): number => {
    const index = VERDICT_ORDER.indexOf(result.verdict);
    return index === -1 ? VERDICT_ORDER.length : index;
  };
  return results
    .map((result, index) => ({ result, index }))
    .toSorted((a, b) => rank(a.result) - rank(b.result) || a.index - b.index)
    .map((entry) => entry.result);
}

/** Every finding one rule reported, plus the worst verdict among them. */
interface RuleGroup {
  readonly rule: string;
  readonly verdict: Finding['verdict'];
  readonly findings: readonly Finding[];
}

/**
 * Collapse findings into one group per rule, keeping first-seen order.
 *
 * Order is the kernel's, not a re-sort: `report.findings` is already flattened
 * in rule order, and two runs of the same site must produce the same document.
 */
function groupByRule(findings: readonly Finding[]): readonly RuleGroup[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const bucket = groups.get(finding.rule);
    if (bucket === undefined) groups.set(finding.rule, [finding]);
    else bucket.push(finding);
  }
  return [...groups].map(([rule, entries]) => ({
    rule,
    verdict: worstVerdict(entries),
    findings: entries,
  }));
}

/** The verdict a grouped card carries: the most serious one inside it. */
function worstVerdict(findings: readonly Finding[]): Finding['verdict'] {
  let worst = findings[0]?.verdict ?? 'info';
  for (const finding of findings) {
    if (FINDING_VERDICT_ORDER.indexOf(finding.verdict) < FINDING_VERDICT_ORDER.indexOf(worst)) {
      worst = finding.verdict;
    }
  }
  return worst;
}

/** One catalogue family's worth of grouped findings. */
interface FamilySection {
  readonly family: string;
  readonly groups: readonly RuleGroup[];
}

/** Catalogue position of a family; unknown families sort last. */
function familyRank(family: string): number {
  const index = FAMILY_ORDER.indexOf(family);
  return index === -1 ? FAMILY_ORDER.length : index;
}

/** Split grouped findings into catalogue-ordered family sections. */
function sectionByFamily(groups: readonly RuleGroup[]): readonly FamilySection[] {
  const byFamily = new Map<string, RuleGroup[]>();
  for (const group of groups) {
    const family = FAMILY_OF_RULE.get(group.rule) ?? '';
    const bucket = byFamily.get(family);
    if (bucket === undefined) byFamily.set(family, [group]);
    else bucket.push(group);
  }
  return [...byFamily]
    .map(([family, entries]) => ({ family, groups: entries }))
    .toSorted((a, b) => familyRank(a.family) - familyRank(b.family));
}

export interface AuditReportScreenProps {
  messages: HostMessages;
  /** Chooses the display language for rule titles. */
  locale: HostLocale;
  /** The URL that was audited, shown as the screen's subtitle. */
  target: string;
  report: Report;
  /** The bundle the report was adjudicated from; exported alongside it. */
  evidence: Evidence;
  /** ISO 8601 — stamped into the exported artifact and its filename. */
  ranAt: string;
  /** An audit is in flight — the re-run was pressed. */
  running: boolean;
  /** Return to the composer + previous audits. */
  onBack: () => void;
  /** Audit THIS report's target again. */
  onRerun: () => void;
}

export function AuditReportScreen({
  messages,
  locale,
  target,
  report,
  evidence,
  ranAt,
  running,
  onBack,
  onRerun,
}: Readonly<AuditReportScreenProps>): JSX.Element {
  const copy = messages.audit;
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [filter, setFilter] = useState<RuleResult['verdict'] | 'all'>('all');

  const onExport = useCallback(async () => {
    setExportState('busy');
    // Built here, not natively: the artifact is one self-contained HTML file
    // carrying the readable report, the embedded evidence and the replay
    // command, and `@movar/audit` owns that format so the CLI and this app
    // produce the same document.
    const html = renderReportArtifact({ report, evidence, target, generatedAt: ranAt });
    const reply = await exportReport(artifactFilename(target, ranAt), html);
    // `undefined` is "no bridge" (outside the app); an explicit `saved: false`
    // is usually the person cancelling, which is not an error worth shouting.
    setExportState(reply === undefined ? 'failed' : 'idle');
  }, [report, evidence, target, ranAt]);

  const headline = sectionByFamily(
    groupByRule(report.findings.filter((finding) => HEADLINE_VERDICTS.has(finding.verdict))),
  );
  const observed = sectionByFamily(
    groupByRule(
      report.findings.filter(
        (finding) =>
          OBSERVED_VERDICTS.has(finding.verdict) && finding.rule !== DEFAULT_LANGUAGE_RULE,
      ),
    ),
  );
  const { coverage } = report;
  // A `Finding` carries only its rule ID; the English title lives on the
  // matching `RuleResult`. Built once per render rather than scanned per card.
  const titles = new Map(report.results.map((result) => [result.rule, result.title]));
  const ranked = rankedResults(report.results);
  const counts = new Map<RuleResult['verdict'], number>();
  for (const result of ranked) counts.set(result.verdict, (counts.get(result.verdict) ?? 0) + 1);
  const visibleResults = filter === 'all' ? ranked : ranked.filter((r) => r.verdict === filter);
  // Which rules got a card above — those coverage rows become index entries.
  // The default-language rule is deliberately absent from that set: the matrix
  // renders it, so its row points there.
  const carded = new Set(
    report.findings.map((finding) => finding.rule).filter((rule) => rule !== DEFAULT_LANGUAGE_RULE),
  );

  return (
    <div className="tool audit-screen">
      <button type="button" className="audit-back" onClick={onBack}>
        <ArrowLeft className="ico" aria-hidden="true" />
        {copy.back}
      </button>

      {/* The SITE is the title: this is a document about example.com, not a
          screen called "Report". The host carries it — a full URL as a heading
          wraps into three lines of punctuation on a phone — and the address
          underneath appears only when it says something the host does not,
          which is a path or a query. `movar.fyi` over `https://movar.fyi/` was
          the same fact twice, dressed as precision. */}
      <header className="audit-screen-head">
        <h1 className="audit-screen-title">{hostOf(target)}</h1>
        {prettyTarget(target) === hostOf(target) ? null : (
          <p className="audit-screen-target">{prettyTarget(target)}</p>
        )}
      </header>

      {/* The verdict panel. The count is the largest thing on the screen
          because it is the one number the document exists to produce — and the
          coverage line sits inside the same panel so "0 broken promises" can
          never be read apart from "…and N rules could not run". */}
      <div className={cn('result-head', report.brokenPromises > 0 ? 'is-fail' : 'is-clear')}>
        <div className="audit-verdict-mark" aria-hidden="true">
          {report.brokenPromises > 0 ? (
            <AlertTriangle className="ico" />
          ) : (
            <Check className="ico" />
          )}
        </div>
        <p className="audit-verdict-count">
          {report.brokenPromises > 0
            ? copy.brokenPromises(report.brokenPromises)
            : copy.noBrokenPromises}
        </p>
        <p className="audit-coverage">
          {copy.coverage(coverage.ran, coverage.rules, coverage.notCollected)}
        </p>
      </div>

      {/* A report is a snapshot of one moment. Auditing the SAME target again is
          the action a reader wants next — either to confirm a fix landed or to
          see whether anything moved — and it keeps the old report in the list
          rather than overwriting it, so the two can be compared. */}
      <div className="audit-actions">
        <button type="button" className="btn" disabled={running} onClick={onRerun}>
          <RotateCw className="ico" aria-hidden="true" />
          {running ? copy.running : copy.again}
        </button>
        <button
          type="button"
          className="btn"
          disabled={exportState === 'busy'}
          onClick={() => {
            void onExport();
          }}
        >
          <Share className="ico" aria-hidden="true" />
          {copy.export}
        </button>
      </div>
      {exportState === 'failed' ? (
        <p className="audit-note is-error">
          <AlertTriangle className="ico" aria-hidden="true" />
          {copy.exportUnavailable}
        </p>
      ) : null}

      {/* `not-collected` is never a pass. This tier collects no rendered DOM and
            follows no declared targets, so a good part of the catalogue could not
            run — saying so on the report's face is the point. */}
      {coverage.notCollected > 0 ? (
        <p className="audit-note">
          <Info className="ico" aria-hidden="true" />
          {copy.notCollectedNote}
        </p>
      ) : null}

      {/* Before the findings: the behaviour they interpret. A reader who sees
          "you asked for Ukrainian and got Russian" reads every finding below as
          a conclusion rather than an assertion. */}
      <MatrixSection evidence={evidence} target={target} copy={copy} locale={locale} />

      {/* No empty state. "Nothing was found" was already said, larger, by the
          verdict panel at the top — and it read as a contradiction whenever a
          report had no failures but did have observations, which render right
          below it. An absent section is the correct way to show an absence. */}
      {headline.length === 0 ? null : (
        <FindingSections
          heading={copy.findings}
          sections={headline}
          copy={copy}
          locale={locale}
          titles={titles}
        />
      )}

      {observed.length === 0 ? null : (
        <FindingSections
          heading={copy.observations}
          note={copy.observationsNote}
          sections={observed}
          copy={copy}
          locale={locale}
          titles={titles}
        />
      )}

      {/* Coverage, always open. This is the half of the report that says what
          was NOT established, and burying it behind a disclosure made the
          headline count look like the whole story — the exact failure mode
          "`not-collected` is never a pass" exists to prevent. It is an index,
          not a second copy of the findings: a rule that already has a card
          above shows its count and a way back to it, and states its sentence
          only when this list is the only place it appears. */}
      <div className="audit-group">
        <h2 className="eyebrow">{copy.allRules}</h2>
        {/* Pills only for verdicts this report actually produced, each with its
            count. A fixed bar would show "Failed 0" on a clean site — an empty
            filter is a dead control, and the count is the useful part anyway.
            They wrap rather than scroll: a strip that ran off the edge of a
            390pt phone hid its own last two options behind an invisible
            scrollbar. */}
        <div className="audit-filters" role="group" aria-label={copy.allRules}>
          <FilterPill
            label={copy.filterAll}
            count={report.results.length}
            active={filter === 'all'}
            onSelect={() => {
              setFilter('all');
            }}
          />
          {VERDICT_ORDER.filter((verdict) => counts.get(verdict) !== undefined).map((verdict) => (
            <FilterPill
              key={verdict}
              label={copy.verdicts[verdict]}
              verdict={verdict}
              count={counts.get(verdict) ?? 0}
              active={filter === verdict}
              onSelect={() => {
                setFilter(verdict);
              }}
            />
          ))}
        </div>
        <ul className="audit-rules">
          {visibleResults.map((result) => (
            <RuleRow
              key={result.rule}
              result={result}
              locale={locale}
              copy={copy}
              anchor={anchorFor(result.rule, carded)}
              // Every finding's own sentence is reachable on screen. A rule
              // whose card was folded into the matrix has nowhere else to keep
              // its, so its row carries it.
              orphanSummaries={
                carded.has(result.rule) ? [] : result.findings.map((finding) => finding.summary)
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One leg of the response matrix, flattened for rendering. */
interface MatrixLeg {
  readonly acceptLanguage: string | null;
  readonly status: number;
  readonly answered: boolean;
  /** `<html lang>` of the page this leg landed on, when it produced one. */
  readonly served: string | undefined;
}

/**
 * The matrix, flattened: what each leg asked for and what came back.
 *
 * For a language audit this IS the behaviour under examination — you asked for
 * Ukrainian and got Russian — and leaving it in the evidence made the findings
 * read as assertions with nothing behind them.
 *
 * The **mechanism** deliberately does not reach the screen: no status codes, no
 * redirect chain, no path segments. Those describe how the answer was reached,
 * and a reader of this report wants the answer. When a bounce or an error IS
 * the story, a rule says so in a sentence — and the redirect chain stays in the
 * evidence bundle and the exported artifact, which is where a site owner
 * disputing the finding goes anyway.
 */
function matrixLegs(evidence: Evidence): readonly MatrixLeg[] {
  if (evidence.source.kind !== 'network') return [];
  return evidence.source.probes.map((probe) => {
    const page =
      probe.pageId === undefined
        ? undefined
        : evidence.pages.find((candidate) => candidate.id === probe.pageId);
    const declared = page?.document.htmlLang ?? undefined;
    return {
      acceptLanguage: probe.acceptLanguage,
      status: probe.status,
      answered: probe.outcome === 'ok',
      served: declared === undefined || declared.trim() === '' ? undefined : declared,
    };
  });
}

/**
 * What one leg came back with, in a reader's words.
 *
 * Four outcomes and no numbers: the site did not answer, it answered with an
 * error, it answered without declaring a language, or it served one. The error
 * case is why {@link MatrixLeg} still carries a status the screen never prints
 * — a 404 page declaring `lang="uk"` would otherwise be reported as the site
 * serving Ukrainian to that preference, which is a false statement about a
 * named company.
 */
function servedLabel(
  leg: MatrixLeg,
  copy: HostMessages['audit'],
  display: (code: string) => string,
): string {
  if (!leg.answered) return copy.matrix.noAnswer;
  if (leg.status >= HTTP_ERROR_FLOOR) return copy.matrix.errored;
  return leg.served === undefined ? copy.matrix.undeclared : display(leg.served);
}

/** One matrix leg: what it asked for, and what came back. */
function MatrixRow({
  leg,
  copy,
  display,
}: Readonly<{
  leg: MatrixLeg;
  copy: HostMessages['audit'];
  display: (code: string) => string;
}>): JSX.Element {
  return (
    <tr className={cn('audit-leg', !leg.answered && 'is-silent')}>
      {/* The language this leg asked for is what identifies the row, so it is
          the row's own heading rather than a cell — and it is named, not coded.
          The column beside it already says "Ukrainian"; a `uk` next to it made
          one table speak two vocabularies. */}
      <th scope="row" className="audit-leg-ask">
        {leg.acceptLanguage === null ? copy.matrix.noPreference : display(leg.acceptLanguage)}
      </th>
      <td className="audit-leg-got">{servedLabel(leg, copy, display)}</td>
    </tr>
  );
}

/**
 * What each request got back — the closest thing to "how the site behaved"
 * that an audit which never renders a page can honestly show.
 */
function MatrixSection({
  evidence,
  target,
  copy,
  locale,
}: Readonly<{
  evidence: Evidence;
  target: string;
  copy: HostMessages['audit'];
  locale: HostLocale;
}>): JSX.Element | null {
  const legs = matrixLegs(evidence);
  if (legs.length === 0) return null;
  const display = makeLanguageDisplay(locale);
  return (
    <div className="audit-group" id={MATRIX_DOM_ID}>
      <h2 className="eyebrow">{copy.matrix.title}</h2>
      {/* The intro stays because it is the one thing the columns cannot say:
          that the ADDRESS never changed. Without it the table is five results;
          with it, it is a controlled experiment with one variable. */}
      <p className="audit-note">{copy.matrix.intro}</p>
      {/* A real table, because this is a real table: five requests differing in
          one variable, read down a column. It rendered as a list of per-row
          grids, so each row sized its own columns and the widest leg — "no
          preference" — knocked its own language out of line with the four
          below. The frame is a wrapper so the rounded corners survive
          `border-collapse`. */}
      <div className="audit-legs-frame">
        <table className="audit-legs">
          <thead>
            <tr>
              <th scope="col">{copy.matrix.colAsked}</th>
              <th scope="col">{copy.matrix.colServed}</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <MatrixRow
                // The matrix varies exactly one thing, so the header IS the
                // leg's identity; `null` is the one no-preference leg.
                key={leg.acceptLanguage ?? 'no-preference'}
                leg={leg}
                copy={copy}
                display={display}
              />
            ))}
          </tbody>
        </table>
      </div>
      {/* No screenshot exists and none can: this collector parses HTML inertly
          and never renders a pixel. Offering the live site is the honest
          substitute, and the label says where it goes — a caption explaining
          that a link to a website shows the website now was answering a
          question nobody asked. */}
      <button
        type="button"
        className="audit-open-site"
        onClick={() => {
          openAuditedSite(target);
        }}
      >
        <ExternalLink className="ico" aria-hidden="true" />
        {copy.matrix.openSite}
      </button>
    </div>
  );
}

/**
 * One titled block of findings, split into catalogue-family sections.
 *
 * The scored block and the observations block differ only in their heading and
 * whether they carry an explanatory note — so they are one component. Two
 * near-identical blocks would drift the moment a finding gains a field, and the
 * two must render a finding the same way or the report quietly says different
 * things about the same shape of evidence.
 */
function FindingSections({
  heading,
  note,
  sections,
  copy,
  locale,
  titles,
}: Readonly<{
  heading: string;
  note?: string;
  sections: readonly FamilySection[];
  copy: HostMessages['audit'];
  locale: HostLocale;
  titles: ReadonlyMap<string, string>;
}>): JSX.Element {
  return (
    <div className="audit-group">
      <h2 className="eyebrow">{heading}</h2>
      {note === undefined ? null : <p className="audit-note">{note}</p>}
      {sections.map((section) => (
        <section className="audit-family" key={section.family}>
          {/* A family with no name in the catalogue (an unknown rule ID from a
              stored bundle) still renders its cards — it just gets no heading
              rather than an empty one. */}
          {familyTitleFor(locale, section.family) === undefined ? null : (
            <h3 className="audit-family-title">{familyTitleFor(locale, section.family)}</h3>
          )}
          <div className="audit-family-body">
            {section.groups.map((group) => (
              <FindingCard
                key={group.rule}
                group={group}
                copy={copy}
                locale={locale}
                fallbackTitle={titles.get(group.rule) ?? group.rule}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One rule's findings, as a single card.
 *
 * Leads with a verdict word, not just a colour: "we could not check this" and
 * "this failed" must never be separable only by hue, and a warning rendered on
 * the same white surface as a note is a warning nobody reads. The rule ID is
 * the citable handle a site owner needs to argue back — indispensable, but
 * reference material, so it lives inside the disclosure rather than competing
 * with the sentence for the top line.
 */
function FindingCard({
  group,
  copy,
  locale,
  fallbackTitle,
}: Readonly<{
  group: RuleGroup;
  copy: HostMessages['audit'];
  locale: HostLocale;
  /** The kernel's English title for this group's rule. */
  fallbackTitle: string;
}>): JSX.Element {
  // Deduplicated: a rule can report the same page twice (once per inventory
  // source, say), and printing the URL twice under "on 4 pages" states a
  // number about this site that is simply false.
  const subjects = [
    ...new Set(group.findings.map(subjectOf).filter((s): s is string => s !== undefined)),
  ];
  // Every finding of a rule carries the same citation (the kernel stamps it
  // from the rule), so the card states it once.
  const citation = group.findings.find((finding) => finding.citation !== undefined)?.citation;
  return (
    <div className={cn('audit-finding', `is-${group.verdict}`)} id={cardDomId(group.rule)}>
      <p className="audit-finding-head">
        <span className="audit-chip">
          <FindingGlyph verdict={group.verdict} />
          {copy.findingVerdicts[group.verdict]}
        </span>
        {/* Only worth saying when there is more than one: "1 page" next to a
            single URL is noise. */}
        {subjects.length > 1 ? (
          <span className="audit-finding-scale">{copy.pageCount(subjects.length)}</span>
        ) : null}
      </p>
      <p className="audit-finding-summary">{ruleTitleFor(locale, group.rule, fallbackTitle)}</p>
      {/* An unscored card's title is a QUESTION — "what language loads with no
          stated preference" — and the answer is the kernel's own measurement.
          Leaving that behind a disclosure made these cards read as a shrug: the
          reader got a chip and a question and had nothing to take away. A
          scored card needs no such promotion — its title already states what is
          wrong, and the measurement is supporting detail.

          The measurement names its own page, so it replaces the subject list
          rather than sitting under a repeat of the URL. It stays in the
          kernel's English for the same reason a finding's summary does: the
          wording a published report quotes cannot depend on who ran it. */}
      {UNSCORED_VERDICTS.has(group.verdict) ? (
        <ul className="audit-measurements">
          {/* Deduplicated for the same reason the subjects are: two pages that
              measured identically produce the identical sentence, and printing
              it twice looks like two findings where there is one fact. The
              per-page breakdown survives in the disclosure. */}
          {[...new Set(group.findings.map((finding) => finding.summary))].map((summary) => (
            <li className="audit-measurement" key={summary}>
              {summary}
            </li>
          ))}
        </ul>
      ) : null}
      {/* The pages, whenever there is more than one. A scored card always shows
          them; an unscored card shows them only when its measurement cannot
          name them itself, which is what a second page means. */}
      {subjects.length === 0 ||
      (UNSCORED_VERDICTS.has(group.verdict) && subjects.length < 2) ? null : (
        <ul className="audit-subjects">
          {subjects.map((subject, index) => (
            <li className="audit-subject" key={`${subject}-${String(index)}`}>
              {subject}
            </li>
          ))}
        </ul>
      )}
      {citation === undefined ? null : (
        <p className="audit-citation">
          <Gavel className="ico" aria-hidden="true" />
          {`${citation.source} — ${citation.article}`}
        </p>
      )}
      <details className="audit-finding-detail">
        <summary>{copy.detail}</summary>
        <dl className="audit-detail-list">
          <dt>{copy.detailRule}</dt>
          <dd className="result-code">{group.rule}</dd>
          {group.findings.map((finding, index) => (
            <FindingDetail
              key={`${finding.rule}-${String(index)}`}
              finding={finding}
              copy={copy}
              // One rule reporting once needs no per-finding heading; several
              // do, or the reader cannot tell which page each sentence is about.
              label={subjects.length > 1 ? subjectOf(finding) : undefined}
            />
          ))}
        </dl>
      </details>
    </div>
  );
}

/** The reference block for one finding inside a grouped card's disclosure. */
function FindingDetail({
  finding,
  copy,
  label,
}: Readonly<{
  finding: Finding;
  copy: HostMessages['audit'];
  /** The page this finding is about, when the card holds more than one. */
  label: string | undefined;
}>): JSX.Element {
  return (
    <>
      {label === undefined ? null : (
        <>
          <dt className="audit-detail-scope">{copy.detailPage}</dt>
          <dd className="audit-detail-scope result-code">{label}</dd>
        </>
      )}
      <dt>{copy.detailFinding}</dt>
      <dd>{finding.summary}</dd>
      <dt>{copy.detailBasis}</dt>
      <dd>
        {copy.grounding[finding.grounding]}
        {/* A downgraded finding says so rather than quietly softening: the
            kernel stripped its failing power because a classifier, not a
            declaration, answered. */}
        {finding.downgradedFrom === undefined ? null : ` · ${copy.downgraded}`}
      </dd>
      {finding.denominator === undefined ? null : (
        <>
          <dt>{copy.detailDenominator}</dt>
          {/* "3 of 340 text nodes" is a finding; "3 nodes" is a smear. */}
          <dd>{copy.denominator(finding.denominator.matched, finding.denominator.examined)}</dd>
        </>
      )}
    </>
  );
}

/**
 * Why a rule landed where it did, in the reader's language.
 *
 * `evaluate()` records this per rule and the report used to drop it, so a row
 * could say "not checked" with no way to learn what was missing — the single
 * thing a reader deciding whether to rely on this document most needs. Returns
 * `undefined` for a rule that reported findings: its card says it better, and
 * the row links there instead.
 */
function whyLineFor(result: RuleResult, copy: HostMessages['audit']): string | undefined {
  if (result.findings.length > 0) return undefined;
  if (result.verdict === 'not-collected') {
    const missing = (result.missingCapabilities ?? []).map((cap) => copy.capabilities[cap]);
    // A `not-collected` rule always names at least one missing capability, but
    // an older stored bundle might not — better a bare verdict than an
    // ungrammatical sentence with a hole in it.
    return missing.length === 0 ? undefined : copy.whyNotCollected(listOf(missing, copy));
  }
  if (result.verdict === 'not-applicable') {
    return result.notApplicableReason === undefined
      ? undefined
      : copy.whyNotApplicable(result.notApplicableReason);
  }
  return copy.whyPassed;
}

/**
 * "a, b and c" — the join the why-sentence reads with.
 *
 * Exported for its own tests. Every rule this tier can leave `not-collected`
 * lacks exactly ONE capability, so the multi-item branch is unreachable from a
 * report rendered here — but `HTTP_AND_TRAVERSAL` rules lack two on filesystem
 * evidence, which is the bundle shape the CLI produces and this screen will
 * open.
 */
export function listOf(parts: readonly string[], copy: HostMessages['audit']): string {
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')}${copy.listAnd}${String(parts.at(-1))}`;
}

function RuleRow({
  result,
  locale,
  copy,
  anchor,
  orphanSummaries,
}: Readonly<{
  result: RuleResult;
  locale: HostLocale;
  copy: HostMessages['audit'];
  /** Where this row jumps — its own card, or the matrix that renders it. */
  anchor: string | undefined;
  /** The kernel's sentences, for a rule with findings but no card of its own. */
  orphanSummaries: readonly string[];
}>): JSX.Element {
  const count = result.findings.length;
  const title = ruleTitleFor(locale, result.rule, result.title);
  const why = whyLineFor(result, copy);

  // EVERY row opens, including the passes. One interaction for all thirty-five
  // rather than "tappable if it found something, inert otherwise" — a list where
  // only some rows respond teaches the reader that the quiet ones hold nothing,
  // which is exactly backwards for the eight that say "not checked".
  return (
    <li
      className={cn('audit-rule', anchor !== undefined && 'has-findings', `is-${result.verdict}`)}
    >
      <details className="audit-rule-detail">
        <summary className="audit-rule-summary">
          <span className="audit-rule-title">{title}</span>
          {/* ONE status token: glyph and word together, in that order, as a
              single thing the eye reads once. The word is the part that must
              survive — "we did not check this" may never be readable as "this
              is fine", and a glyph alone leaves that to the reader's guess. */}
          <span className="audit-rule-state">
            <RuleGlyph verdict={result.verdict} />
            {count > 0 ? copy.findingCount(count) : copy.verdicts[result.verdict]}
          </span>
          <ChevronRight className="ico audit-rule-chevron" aria-hidden="true" />
        </summary>
        <div className="audit-rule-why">
          {why === undefined ? null : <p className="audit-rule-because">{why}</p>}
          <dl className="audit-detail-list">
            {orphanSummaries.length === 0 ? null : (
              <>
                <dt>{copy.detailFinding}</dt>
                {orphanSummaries.map((summary) => (
                  <dd key={summary}>{summary}</dd>
                ))}
              </>
            )}
            <dt>{copy.detailBasis}</dt>
            <dd>{copy.grounding[result.grounding]}</dd>
            <dt>{copy.detailRule}</dt>
            <dd className="result-code">{result.rule}</dd>
          </dl>
          {anchor === undefined ? null : (
            <button
              type="button"
              className="audit-rule-jump"
              onClick={() => {
                document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
              }}
            >
              {copy.goToFindings}
              <ChevronRight className="ico" aria-hidden="true" />
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

/** The per-rule glyph. A `not-collected` rule gets its OWN mark rather than
 *  sharing the pass tick — "we did not check this" must never look like "this
 *  is fine", which is the default failure mode of every audit tool. */
function RuleGlyph({ verdict }: Readonly<{ verdict: RuleResult['verdict'] }>): JSX.Element {
  // Decorative: the status word beside it carries the meaning, so a screen
  // reader that announced both would read every row twice.
  if (verdict === 'not-collected') return <ShieldQuestion className="ico" aria-hidden="true" />;
  if (verdict === 'fail') return <AlertTriangle className="ico" aria-hidden="true" />;
  if (verdict === 'warn') return <Info className="ico" aria-hidden="true" />;
  if (verdict === 'not-applicable') return <Minus className="ico" aria-hidden="true" />;
  return <Check className="ico" aria-hidden="true" />;
}

/** The per-card glyph. Mirrors {@link RuleGlyph} so a finding and its coverage
 *  row are recognisably the same thing. */
function FindingGlyph({ verdict }: Readonly<{ verdict: Finding['verdict'] }>): JSX.Element {
  if (verdict === 'fail') return <AlertTriangle className="ico" aria-hidden="true" />;
  if (verdict === 'warn') return <Info className="ico" aria-hidden="true" />;
  return <Info className="ico" aria-hidden="true" />;
}

/**
 * The exported file's name: `movar-audit-<host>-<stamp>.html`.
 *
 * Built from the host and the run's own timestamp so a folder of exports sorts
 * and reads sensibly. Everything outside a conservative character set is
 * replaced rather than dropped, so two different targets can never collapse to
 * one name and silently overwrite each other. Swift re-validates this before
 * touching the filesystem — this side is convenience, not the safety boundary.
 */
export function artifactFilename(target: string, ranAt: string): string {
  // `2026-08-14T14:05:00.000Z` -> `2026-08-14t14-05-00`: seconds are enough to
  // separate two runs a person made, and the milliseconds only add noise to a
  // name they will read in a folder listing.
  const SECONDS_PRECISION = 19;
  // `hostOf` hands back the raw target when it cannot parse one; `safeSlug`
  // bounds whatever that is and never returns empty, so the filename holds.
  return `movar-audit-${safeSlug(hostOf(target))}-${safeSlug(ranAt.slice(0, SECONDS_PRECISION))}.html`;
}

/**
 * Lower-case, `[a-z0-9-]` only, collapsed — never empty.
 *
 * Split-and-rejoin rather than replace-then-trim: an anchored `^-+|-+$` over
 * attacker-influenced text (a hostname) is the shape that backtracks
 * super-linearly, and splitting cannot.
 */
function safeSlug(value: string): string {
  const parts = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((part) => part !== '');
  return parts.length === 0 ? 'report' : parts.join('-');
}

/** One filter chip: a label, how many rules are in it, and whether it is on. */
function FilterPill({
  label,
  count,
  verdict,
  active,
  onSelect,
}: Readonly<{
  label: string;
  count: number;
  /** Tints the chip's mark, so the bar doubles as the list's legend. */
  verdict?: RuleResult['verdict'];
  active: boolean;
  onSelect: () => void;
}>): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'audit-filter',
        verdict !== undefined && `is-${verdict}`,
        active && 'is-active',
      )}
      aria-pressed={active}
      onClick={onSelect}
    >
      {verdict === undefined ? null : <span className="audit-filter-mark" aria-hidden="true" />}
      {label}
      <span className="audit-filter-count">{count}</span>
    </button>
  );
}
