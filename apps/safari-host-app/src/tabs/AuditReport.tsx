import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Gavel,
  Info,
  RotateCw,
  Share,
  ShieldQuestion,
} from 'lucide-react';
import { renderReportArtifact } from '@movar/audit/artifact';
import type { Evidence, Finding, Report, RuleResult } from '@movar/audit';
import { cn } from '@movar/ui';
import { exportReport } from '../bridge';
import { ruleTitleFor } from '../i18n';
import type { HostLocale, HostMessages } from '../i18n';

/**
 * The language conformance report — its own screen, not a result panel.
 *
 * A report is a **document**: a headline count, what could not be checked, the
 * findings, and the full rule list behind a disclosure. Rendering it inline
 * under the composer made it read as the output of a form; it is the artifact
 * the whole tool exists to produce, and an advocate reads it top to bottom.
 *
 * This component renders a `Report` and decides nothing. Every verdict, count
 * and downgrade already happened inside `evaluate()`, the same pure kernel the
 * CLI runs — which is what lets the site being named re-run the evidence and
 * get this same page back.
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
 * Reading order for the coverage list: what is broken, then what is uncertain,
 * then what is fine.
 *
 * `not-collected` sits ABOVE `not-applicable` and `pass` deliberately. It is
 * not a mild outcome — it is the audit admitting it could not establish
 * something, which a reader deciding whether to act on this report needs before
 * they read a single pass. Sorting it down among the passes would quietly
 * restore the "silently passing what it did not check" failure the kernel
 * refuses to make.
 */
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

/**
 * The catalogue, most important first — and stable.
 *
 * Ties keep catalogue order (the index), so two runs of the same site produce
 * the same document. A sort that reshuffled equal rows would make two exported
 * artifacts differ for no reason a reader could explain.
 */
/**
 * A stable DOM id per finding, so the coverage list can act as an index into
 * the findings above rather than restating them.
 *
 * Keyed by rule plus the finding's ordinal WITHIN that rule: a rule can report
 * several findings (one per page), and an id that ignored that would point
 * every row at the same card.
 */
function findingDomIds(findings: readonly Finding[]): ReadonlyMap<Finding, string> {
  const seen = new Map<string, number>();
  const ids = new Map<Finding, string>();
  for (const finding of findings) {
    const ordinal = seen.get(finding.rule) ?? 0;
    seen.set(finding.rule, ordinal + 1);
    ids.set(finding, `finding-${finding.rule.replaceAll('/', '-')}-${String(ordinal)}`);
  }
  return ids;
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
  /** A check is in flight — the re-run was pressed. */
  running: boolean;
  /** Return to the composer + previous checks. */
  onBack: () => void;
  /** Re-check THIS report's target. */
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

  const headline = report.findings.filter((finding) => HEADLINE_VERDICTS.has(finding.verdict));
  const observed = report.findings.filter((finding) => OBSERVED_VERDICTS.has(finding.verdict));
  const { coverage } = report;
  // A `Finding` carries only its rule ID; the English title lives on the
  // matching `RuleResult`. Built once per render rather than scanned per card.
  const titles = new Map(report.results.map((result) => [result.rule, result.title]));
  const findingIds = findingDomIds(report.findings);
  const ranked = rankedResults(report.results);
  const counts = new Map<RuleResult['verdict'], number>();
  for (const result of ranked) counts.set(result.verdict, (counts.get(result.verdict) ?? 0) + 1);
  const visibleResults = filter === 'all' ? ranked : ranked.filter((r) => r.verdict === filter);
  // First finding per rule — the anchor a coverage row jumps to.
  const firstFindingId = new Map<string, string>();
  for (const finding of report.findings) {
    const id = findingIds.get(finding);
    if (id !== undefined && !firstFindingId.has(finding.rule)) firstFindingId.set(finding.rule, id);
  }

  return (
    <div className="tool audit-screen">
      <button type="button" className="audit-back" onClick={onBack}>
        <ArrowLeft className="ico" aria-hidden="true" />
        {copy.back}
      </button>

      {/* The SITE is the title: this is a document about example.com, not a
          screen called "Report". The host carries it — a full URL as a heading
          wraps into three lines of punctuation on a phone — with the exact
          audited address kept underneath, because a report naming only the host
          would be imprecise about what was actually fetched. */}
      <header className="audit-screen-head">
        <h1 className="audit-screen-title">{hostOf(target)}</h1>
        <p className="audit-screen-target">{target}</p>
      </header>

      <div className="result-head">
        <div className={cn('badge', report.brokenPromises > 0 ? 'is-danger' : 'is-accent')}>
          {report.brokenPromises > 0 ? (
            <AlertTriangle className="ico" aria-hidden="true" />
          ) : (
            <Check className="ico" aria-hidden="true" />
          )}
        </div>
        <div className="result-text">
          <span className="result-verdict">
            {report.brokenPromises > 0
              ? copy.brokenPromises(report.brokenPromises)
              : copy.noBrokenPromises}
          </span>
          <span className="audit-coverage">
            {copy.coverage(coverage.ran, coverage.rules, coverage.notCollected)}
          </span>
        </div>
      </div>

      {/* A report is a snapshot of one moment. Re-checking the SAME target is
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

      {headline.length === 0 ? (
        <p className="audit-note">{copy.nothingToReport}</p>
      ) : (
        <FindingGroup
          heading={copy.findings}
          findings={headline}
          copy={copy}
          locale={locale}
          titles={titles}
          ids={findingIds}
        />
      )}

      {observed.length === 0 ? null : (
        <FindingGroup
          heading={copy.observations}
          note={copy.observationsNote}
          findings={observed}
          copy={copy}
          locale={locale}
          titles={titles}
          ids={findingIds}
        />
      )}

      {/* Coverage, always open. This is the half of the report that says what
          was NOT established, and burying it behind a disclosure made the
          headline count look like the whole story — the exact failure mode
          "`not-collected` is never a pass" exists to prevent. It is an index,
          not a footnote: identity (the rule ID) stays on each finding's own
          Details, so the two do not read as the same list twice. */}
      <div className="audit-group">
        <span className="eyebrow">{copy.allRules}</span>
        {/* Pills only for verdicts this report actually produced, each with its
            count. A fixed bar would show "Failed 0" on a clean site — an empty
            filter is a dead control, and the count is the useful part anyway. */}
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
              anchor={firstFindingId.get(result.rule)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * One titled group of findings.
 *
 * The scored group and the observations group differ only in their heading and
 * whether they carry an explanatory note — so they are one component. Two
 * near-identical blocks would drift the moment a finding gains a field, and the
 * two groups must render a finding the same way or the report quietly says
 * different things about the same shape of evidence.
 */
function FindingGroup({
  heading,
  note,
  findings,
  copy,
  locale,
  titles,
  ids,
}: Readonly<{
  heading: string;
  note?: string;
  findings: readonly Finding[];
  copy: HostMessages['audit'];
  locale: HostLocale;
  titles: ReadonlyMap<string, string>;
  ids: ReadonlyMap<Finding, string>;
}>): JSX.Element {
  return (
    <div className="audit-group">
      <span className="eyebrow">{heading}</span>
      {note === undefined ? null : <p className="audit-note">{note}</p>}
      {findings.map((finding, index) => (
        <FindingCard
          key={`${finding.rule}-${String(index)}`}
          finding={finding}
          copy={copy}
          locale={locale}
          fallbackTitle={titles.get(finding.rule) ?? finding.rule}
          domId={ids.get(finding)}
        />
      ))}
    </div>
  );
}

/** One finding. The rule ID is shown because it is the stable, citable handle. */
function FindingCard({
  finding,
  copy,
  locale,
  fallbackTitle,
  domId,
}: Readonly<{
  finding: Finding;
  copy: HostMessages['audit'];
  locale: HostLocale;
  /** The kernel's English title for this finding's rule. */
  fallbackTitle: string;
  /** Anchor target for the coverage list's matching row. */
  domId: string | undefined;
}>): JSX.Element {
  const subject = subjectOf(finding);
  return (
    <div className={cn('audit-finding', `is-${finding.verdict}`)} id={domId}>
      {/* The finding leads with what it FOUND. The rule ID is the citable
          handle a site owner needs to argue back — indispensable, but it is
          reference material, so it lives inside the detail disclosure rather
          than competing with the sentence for the top line. */}
      <p className="audit-finding-summary">{ruleTitleFor(locale, finding.rule, fallbackTitle)}</p>
      {subject === undefined ? null : <p className="audit-subject">{subject}</p>}
      {finding.citation === undefined ? null : (
        <p className="audit-citation">
          <Gavel className="ico" aria-hidden="true" />
          {`${finding.citation.source} — ${finding.citation.article}`}
        </p>
      )}
      <details className="audit-finding-detail">
        <summary>{copy.detail}</summary>
        <dl className="audit-detail-list">
          <dt>{copy.detailRule}</dt>
          <dd className="result-code">{finding.rule}</dd>
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
        </dl>
      </details>
    </div>
  );
}

function RuleRow({
  result,
  locale,
  copy,
  anchor,
}: Readonly<{
  result: RuleResult;
  locale: HostLocale;
  copy: HostMessages['audit'];
  /** DOM id of this rule's first finding, when it reported any. */
  anchor: string | undefined;
}>): JSX.Element {
  const count = result.findings.length;
  const title = ruleTitleFor(locale, result.rule, result.title);
  const body = (
    <>
      <span className="audit-rule-verdict" aria-hidden="true">
        <RuleGlyph verdict={result.verdict} />
      </span>
      <span className="audit-rule-title">{title}</span>
      {/* The word, not just the glyph: "we did not check this" must never be
          readable as "this is fine", and a coloured icon alone leaves that to
          the reader's guess. */}
      <span className="audit-rule-state">
        {count > 0 ? copy.findingCount(count) : copy.verdicts[result.verdict]}
      </span>
    </>
  );

  // A rule that reported findings makes this row an INDEX ENTRY: it says how
  // many it produced and jumps to the first. A rule that reported none stays
  // inert text — nothing to navigate to, so nothing that looks tappable.
  if (anchor === undefined) {
    return <li className={cn('audit-rule', `is-${result.verdict}`)}>{body}</li>;
  }
  return (
    <li className={cn('audit-rule', 'has-findings', `is-${result.verdict}`)}>
      <button
        type="button"
        className="audit-rule-jump"
        onClick={() => {
          document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
        }}
      >
        {body}
      </button>
    </li>
  );
}

/** The per-rule glyph. A `not-collected` rule gets its OWN mark rather than
 *  sharing the pass tick — "we did not check this" must never look like "this
 *  is fine", which is the default failure mode of every audit tool. */
function RuleGlyph({ verdict }: Readonly<{ verdict: RuleResult['verdict'] }>): JSX.Element {
  if (verdict === 'not-collected') return <ShieldQuestion className="ico" />;
  if (verdict === 'fail') return <AlertTriangle className="ico" />;
  if (verdict === 'warn') return <Info className="ico" />;
  return <Check className="ico" />;
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
  return `movar-audit-${safeSlug(hostOf(target))}-${safeSlug(ranAt.slice(0, SECONDS_PRECISION))}.html`;
}

function hostOf(target: string): string {
  try {
    return new URL(target).host;
  } catch {
    return 'site';
  }
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
  active,
  onSelect,
}: Readonly<{ label: string; count: number; active: boolean; onSelect: () => void }>): JSX.Element {
  return (
    <button
      type="button"
      className={cn('audit-filter', active && 'is-active')}
      aria-pressed={active}
      onClick={onSelect}
    >
      {label}
      <span className="audit-filter-count">{count}</span>
    </button>
  );
}
