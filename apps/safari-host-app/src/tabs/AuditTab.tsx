import { useCallback, useLayoutEffect, useState } from 'react';
import type { JSX } from 'react';
import { AlertTriangle, Check, ChevronRight, Gavel, Info, Search } from 'lucide-react';
import { CORE_RULESET, evaluate, UA_PACK_FAMILIES, withPack } from '@movar/audit';
import { SITE_URL } from '@movar/brand';
import type { Evidence, Report } from '@movar/audit';
import { cn } from '@movar/ui';
import { BridgeUnavailableError, collectMatrix, MATRIX_HEADERS } from '../audit/collect';
import type { ProbeReply, ProbeRequest } from '../bridge';
import type { HostLocale, HostMessages } from '../i18n';
import { AuditReportScreen } from './AuditReport';

/**
 * Audit tab — Movar Audit's app surface.
 *
 * Two screens, not one panel. The **composer** takes a URL and lists the checks
 * already run; opening one pushes the **report** screen (`./AuditReport`). A
 * language conformance report is a document an advocate reads top to bottom and
 * hands to a company — rendering it inline under the form made it read as a
 * form's output, and buried the previous run the moment a new one started.
 *
 * macOS first, per `docs/movar-audit.md` §9: the first real user is a
 * non-technical advocate producing reports across many sites, at a desk.
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
  /** Formats each previous check's timestamp. */
  locale: HostLocale;
  /**
   * The probe port, defaulting to the native bridge. Injectable for the same
   * reason `SettingsTab` takes a `SettingsSource`: it keeps this component
   * depending on a contract rather than on `webkit`, so the report-rendering
   * path — the part a user actually reads — is testable without a WebView.
   */
  probe?: (request: ProbeRequest) => Promise<ProbeReply | undefined>;
}

/** One completed check, kept so it can be reopened without re-probing a site. */
interface AuditRun {
  readonly id: string;
  readonly target: string;
  /** ISO 8601, from the device clock. */
  readonly ranAt: string;
  readonly report: Report;
  /**
   * The bundle the report was adjudicated from, kept so an export can carry it.
   *
   * ADR §8: report and proof must not get separable — "the thing an auditor
   * posts is the thing a site owner re-runs". Dropping the evidence here to
   * save memory would mean an exported file nobody can replay, which is the
   * whole difference between credible pressure and a smear.
   */
  readonly evidence: Evidence;
}

/**
 * What the composer is doing. `error` carries a message the user can act on;
 * `running` carries how far through the matrix the run is.
 *
 * The progress is on the state rather than in a second `useState` so a run can
 * never render as "in flight, 5 of 5" or as a stale bar after it finished — the
 * two facts change together, so they are one value.
 */
type ComposerState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly done: number; readonly total: number }
  | { readonly kind: 'error'; readonly message: string };

/**
 * How many previous checks the list keeps.
 *
 * Session-scoped and in memory: nothing about an audit is written to disk here.
 * That is the conservative default for a list of "sites this person chose to
 * investigate", which is not a neutral record — persisting it is a decision to
 * make deliberately, not a side effect of adding a history list.
 */
const MAX_REMEMBERED_RUNS = 25;

/** Fraction → CSS percentage, for the progress bar's width. */
const PERCENT = 100;

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
 * What the URL box starts on: Movar's own site.
 *
 * Dogfooding, and the honest kind. movar.fyi deliberately ships **no** language
 * picker, so the picker family reads `not-applicable` rather than passing — the
 * first thing a new user sees is therefore a report that distinguishes "checked
 * and fine" from "there was nothing here to check", which is the distinction the
 * whole tool rests on. Read from `@movar/brand` so it follows the domain rather
 * than pinning a second copy of it.
 */
const DEFAULT_TARGET = SITE_URL;

export function AuditTab({ messages, locale, probe }: Readonly<AuditTabProps>): JSX.Element {
  const [url, setUrl] = useState(DEFAULT_TARGET);
  const [applyUaPack, setApplyUaPack] = useState(false);
  const [state, setState] = useState<ComposerState>({ kind: 'idle' });
  const [runs, setRuns] = useState<readonly AuditRun[]>([]);
  /** The run being read, or `null` for the composer. */
  const [open, setOpen] = useState<AuditRun | null>(null);
  const copy = messages.audit;

  /**
   * Run one check against an already-normalized target.
   *
   * Takes the target rather than reading the input, so "Audit again" on the
   * report screen re-runs the URL that report was produced from — not whatever
   * happens to be sitting in the composer behind it.
   */
  const runAudit = useCallback(
    async (target: string) => {
      setState({ kind: 'running', done: 0, total: MATRIX_HEADERS.length });
      try {
        const evidence = await collectMatrix({
          url: target,
          onProgress: (done, total) => {
            // Guarded: a late leg settling after a failure must not resurrect
            // the running state over an error the person is reading.
            setState((current) =>
              current.kind === 'running' ? { ...current, done, total } : current,
            );
          },
          ...(probe === undefined ? {} : { probeImpl: probe }),
        });
        const ruleset = applyUaPack ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
        const finished: AuditRun = {
          id: `${target} ${String(Date.now())}`,
          target,
          ranAt: new Date().toISOString(),
          report: evaluate(evidence, ruleset),
          evidence,
        };
        setRuns((previous) => [finished, ...previous].slice(0, MAX_REMEMBERED_RUNS));
        setState({ kind: 'idle' });
        // Straight to the report: the person pressed the button to read it.
        setOpen(finished);
      } catch (error) {
        // The bridge being absent is a fact about the app, not about the site —
        // it gets its own message so nobody reads it as "this site is broken".
        setState({
          kind: 'error',
          message: error instanceof BridgeUnavailableError ? copy.noBridge : copy.failed,
        });
        // A failed re-run returns to the composer, where the error belongs —
        // leaving the previous report on screen under a failed re-run would
        // make a stale document look like the fresh one.
        setOpen(null);
      }
    },
    [applyUaPack, copy, probe],
  );

  /** The composer's button: normalize what was typed, then run it. */
  const runTyped = useCallback(async () => {
    const target = normalizeAuditUrl(url);
    if (target === null) {
      setState({ kind: 'error', message: copy.invalidUrl });
      return;
    }
    await runAudit(target);
  }, [url, copy, runAudit]);

  // Both screens share one scroller, so a report opened from halfway down the
  // history list would otherwise start halfway down. Layout effect, not effect:
  // the reset lands before paint, so no frame shows the wrong offset.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [open]);

  if (open !== null) {
    return (
      <AuditReportScreen
        messages={messages}
        locale={locale}
        target={open.target}
        report={open.report}
        evidence={open.evidence}
        ranAt={open.ranAt}
        running={state.kind === 'running'}
        onBack={() => {
          setOpen(null);
        }}
        onRerun={() => {
          void runAudit(open.target);
        }}
      />
    );
  }

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
            if (event.key === 'Enter') void runTyped();
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
            void runTyped();
          }}
        >
          <Search className="ico" aria-hidden="true" />
          {state.kind === 'running' ? copy.running : copy.run}
        </button>
      </div>

      <output className="audit-status" aria-live="polite" hidden={state.kind === 'idle'}>
        {state.kind === 'running' ? (
          <>
            {/* A determinate bar, because the total genuinely is known: the
                matrix is a fixed number of legs. An indeterminate spinner would
                say only "something is happening" for what can be a two-minute
                wait against a slow site. */}
            <div className="audit-progress">
              <div
                className="audit-progress-track"
                role="progressbar"
                aria-valuenow={state.done}
                aria-valuemin={0}
                aria-valuemax={state.total}
                aria-label={copy.running}
              >
                <div
                  className="audit-progress-fill"
                  style={{ width: `${String((state.done / state.total) * PERCENT)}%` }}
                />
              </div>
              <span className="audit-progress-label">{copy.progress(state.done, state.total)}</span>
            </div>
            <p className="audit-note">{copy.runningNote}</p>
          </>
        ) : null}
        {state.kind === 'error' ? (
          <p className="audit-note is-error">
            <AlertTriangle className="ico" aria-hidden="true" />
            {state.message}
          </p>
        ) : null}
      </output>

      {runs.length === 0 ? null : (
        <section className="sec">
          <h2 className="sec-title">{copy.previous}</h2>
          {/* Stated once, next to the thing it is about. Nothing here is
              written to disk — see MAX_REMEMBERED_RUNS — and a reader who is
              building a case against a company needs to know that BEFORE they
              close the app, not after. */}
          <p className="audit-note">
            <Info className="ico" aria-hidden="true" />
            {copy.notStored}
          </p>
          <ul className="audit-runs">
            {runs.map((entry) => (
              <RunRow
                key={entry.id}
                entry={entry}
                copy={copy}
                locale={locale}
                onOpen={() => {
                  setOpen(entry);
                }}
              />
            ))}
          </ul>
        </section>
      )}

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

/** When a check ran, in the host's locale. Falls back to the raw stamp. */
function ranAtLabel(ranAt: string, locale: HostLocale): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(ranAt),
    );
  } catch {
    return ranAt;
  }
}

/**
 * One previous check. Leads with the headline it produced, because that is what
 * makes a list of past runs worth having — a row that only said "movar.fyi,
 * 13:57" would make you open every one to find the one that failed.
 */
function RunRow({
  entry,
  copy,
  locale,
  onOpen,
}: Readonly<{
  entry: AuditRun;
  copy: HostMessages['audit'];
  locale: HostLocale;
  onOpen: () => void;
}>): JSX.Element {
  const broken = entry.report.brokenPromises;
  return (
    <li>
      <button type="button" className={cn('audit-run', broken > 0 && 'is-fail')} onClick={onOpen}>
        <span className="audit-run-mark" aria-hidden="true">
          {broken > 0 ? <AlertTriangle className="ico" /> : <Check className="ico" />}
        </span>
        <span className="audit-run-text">
          <span className="audit-run-target">{entry.target}</span>
          <span className="audit-run-meta">
            {broken > 0 ? copy.brokenPromises(broken) : copy.noBrokenPromises} ·{' '}
            {ranAtLabel(entry.ranAt, locale)}
          </span>
        </span>
        <ChevronRight className="ico audit-run-chevron" aria-hidden="true" />
      </button>
    </li>
  );
}
