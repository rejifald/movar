import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { AlertTriangle, Check, Gavel, Info, Search, ShieldQuestion } from 'lucide-react';
import { CORE_RULESET, evaluate, UA_PACK_FAMILIES, withPack } from '@movar/audit';
import type { Finding, Report, RuleResult } from '@movar/audit';
import { cn } from '@movar/ui';
import { BridgeUnavailableError, collectMatrix } from '../audit/collect';
import type { ProbeReply, ProbeRequest } from '../bridge';
import type { HostMessages } from '../i18n';

/**
 * Audit tab — Movar Audit's app surface.
 *
 * The user types a URL; the tab runs the response matrix through the native
 * prober, digests each response, adjudicates it against the rule catalogue, and
 * renders the report. macOS first, per `docs/movar-audit.md` §9: the first real
 * user is a non-technical advocate producing reports across many sites, and
 * that person is at a desk.
 *
 * Three things this tab deliberately does NOT do:
 *
 * - **It does not judge.** Every verdict comes from `evaluate()`, the pure
 *   kernel the CLI runs. This file renders a `Report`; it never decides what is
 *   in one. That is what lets a site owner re-run the same evidence and get the
 *   same answer.
 * - **It does not fetch.** Every request goes through the Swift prober — the
 *   CSP makes that structural rather than a matter of discipline.
 * - **It does not apply a jurisdiction pack unless asked.** The Ukrainian
 *   statute rules are a legal claim about a specific country's law, so they are
 *   composed in by an explicit choice and off by default. Applying Law
 *   2704-VIII to a German site would be a false accusation with the product's
 *   name on it.
 */
export interface AuditTabProps {
  messages: HostMessages;
  /**
   * The probe port, defaulting to the native bridge. Injectable for the same
   * reason `SettingsTab` takes a `SettingsSource`: it keeps this component
   * depending on a contract rather than on `webkit`, so the report-rendering
   * path — the part a user actually reads — is testable without a WebView.
   */
  probe?: (request: ProbeRequest) => Promise<ProbeReply | undefined>;
}

/** What the tab is doing. `error` carries a message the user can act on. */
type AuditState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly report: Report }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Normalize what the user typed into something probe-able.
 *
 * People paste `example.com`. Defaulting a bare host to `https` is the right
 * guess — and the redirect chain records it honestly if the site sends us
 * somewhere else. Returns `null` when there is nothing usable, so the tab can
 * say so instead of probing gibberish.
 */
export function normalizeAuditUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const candidate = /^[a-z][\w+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const scheme = url.protocol.toLowerCase();
    // No host check is needed: `http`/`https` are WHATWG "special" schemes, so
    // `new URL` has already thrown for a hostless one.
    if (scheme !== 'https:' && scheme !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

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

export function AuditTab({ messages, probe }: Readonly<AuditTabProps>): JSX.Element {
  const [url, setUrl] = useState('');
  const [applyUaPack, setApplyUaPack] = useState(false);
  const [state, setState] = useState<AuditState>({ kind: 'idle' });
  const copy = messages.audit;

  const run = useCallback(async () => {
    const target = normalizeAuditUrl(url);
    if (target === null) {
      setState({ kind: 'error', message: copy.invalidUrl });
      return;
    }
    setState({ kind: 'running' });
    try {
      const evidence = await collectMatrix({
        url: target,
        ...(probe === undefined ? {} : { probeImpl: probe }),
      });
      const ruleset = applyUaPack ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
      setState({ kind: 'done', report: evaluate(evidence, ruleset) });
    } catch (error) {
      // The bridge being absent is a fact about the app, not about the site —
      // it gets its own message so nobody reads it as "this site is broken".
      setState({
        kind: 'error',
        message: error instanceof BridgeUnavailableError ? copy.noBridge : copy.failed,
      });
    }
  }, [url, applyUaPack, copy, probe]);

  return (
    <div className="tool">
      <div>
        <h2 className="sec-title">{copy.title}</h2>
        <p className="sec-intro">{copy.intro}</p>
      </div>

      <div className="composer">
        <input
          id="audit-url"
          className="tool-input audit-url"
          type="url"
          inputMode="url"
          placeholder={copy.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          disabled={state.kind === 'running'}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void run();
          }}
        />

        <label className="audit-pack" htmlFor="audit-ua-pack">
          <input
            id="audit-ua-pack"
            type="checkbox"
            checked={applyUaPack}
            disabled={state.kind === 'running'}
            onChange={(event) => {
              setApplyUaPack(event.target.checked);
            }}
          />
          <span className="audit-pack-label">
            <Gavel className="ico" aria-hidden="true" />
            {copy.uaPack}
          </span>
          <span className="audit-pack-hint">{copy.uaPackHint}</span>
        </label>

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={state.kind === 'running'}
          onClick={() => {
            void run();
          }}
        >
          <Search className="ico" aria-hidden="true" />
          {state.kind === 'running' ? copy.running : copy.run}
        </button>
      </div>

      <output
        className="tool-result audit-result"
        aria-live="polite"
        hidden={state.kind === 'idle'}
      >
        {state.kind === 'running' ? <p className="audit-note">{copy.runningNote}</p> : null}
        {state.kind === 'error' ? (
          <p className="audit-note is-error">
            <AlertTriangle className="ico" aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
        {state.kind === 'done' ? <ReportView report={state.report} messages={messages} /> : null}
      </output>

      <section className="sec">
        <h2 className="sec-title">{copy.privacy.title}</h2>
        <ul className="limits sec-body">
          {copy.privacy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The report: headline count, coverage, then every finding worth reading. */
function ReportView({
  report,
  messages,
}: Readonly<{ report: Report; messages: HostMessages }>): JSX.Element {
  const copy = messages.audit;
  const headline = report.findings.filter((finding) => HEADLINE_VERDICTS.has(finding.verdict));
  const observed = report.findings.filter((finding) => OBSERVED_VERDICTS.has(finding.verdict));
  const { coverage } = report;

  return (
    <>
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
        <div className="clues">
          <span className="eyebrow">{copy.findings}</span>
          {headline.map((finding, index) => (
            <FindingCard key={`${finding.rule}-${String(index)}`} finding={finding} copy={copy} />
          ))}
        </div>
      )}

      {observed.length === 0 ? null : (
        <div className="clues">
          <span className="eyebrow">{copy.observations}</span>
          <p className="audit-note">{copy.observationsNote}</p>
          {observed.map((finding, index) => (
            <FindingCard key={`${finding.rule}-${String(index)}`} finding={finding} copy={copy} />
          ))}
        </div>
      )}

      <details className="audit-details">
        <summary>{copy.allRules}</summary>
        <ul className="audit-rules">
          {report.results.map((result) => (
            <RuleRow key={result.rule} result={result} />
          ))}
        </ul>
      </details>
    </>
  );
}

/** One finding. The rule ID is shown because it is the stable, citable handle. */
function FindingCard({
  finding,
  copy,
}: Readonly<{ finding: Finding; copy: HostMessages['audit'] }>): JSX.Element {
  const subject = subjectOf(finding);
  return (
    <div className={cn('clue-lang audit-finding', `is-${finding.verdict}`)}>
      <div className="clue-head">
        <span className="clue-name">{finding.summary}</span>
        <span className="result-code">{finding.rule}</span>
      </div>
      {subject === undefined ? null : <p className="audit-subject">{subject}</p>}
      <p className="audit-grounding">
        {copy.grounding[finding.grounding]}
        {/* A downgraded finding says so rather than quietly softening: the
            kernel stripped its failing power because a classifier, not a
            declaration, answered. */}
        {finding.downgradedFrom === undefined ? null : ` · ${copy.downgraded}`}
      </p>
      {finding.citation === undefined ? null : (
        <p className="audit-citation">
          <Gavel className="ico" aria-hidden="true" />
          {`${finding.citation.source} — ${finding.citation.article}`}
        </p>
      )}
    </div>
  );
}

function RuleRow({ result }: Readonly<{ result: RuleResult }>): JSX.Element {
  return (
    <li className={cn('audit-rule', `is-${result.verdict}`)}>
      <span className="audit-rule-verdict" aria-hidden="true">
        <RuleGlyph verdict={result.verdict} />
      </span>
      <span className="audit-rule-title">{result.title}</span>
      <span className="result-code">{result.rule}</span>
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
