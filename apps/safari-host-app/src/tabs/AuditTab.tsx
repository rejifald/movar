import { useCallback, useLayoutEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileSearch,
  Gavel,
  Globe,
  Info,
  X,
} from 'lucide-react';
import {
  MATRIX_HEADERS,
  ProbeUnavailableError,
  runAudit as runAuditEngine,
} from '@movar/audit-engine';
import { SITE_URL } from '@movar/brand';
import type { Evidence, Report } from '@movar/audit';
import { cn } from '@movar/ui';
import { hostOf, prettyTarget } from '../audit/target';
import { probe as bridgeProbe } from '../bridge';
import type { ProbeReply, ProbeRequest } from '../bridge';
import type { HostLocale, HostMessages } from '../i18n';
import { AuditReportScreen } from './AuditReport';

/**
 * Audit tab — Movar Audit's app surface.
 *
 * Two screens, not one panel. The **composer** takes a URL, says what Movar
 * Audit is, and lists the audits already run; opening one pushes the **report**
 * screen (`./AuditReport`). A
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
  /** Formats each previous audit's timestamp. */
  locale: HostLocale;
  /**
   * The probe port, defaulting to the native bridge. Injectable for the same
   * reason `SettingsTab` takes a `SettingsSource`: it keeps this component
   * depending on a contract rather than on `webkit`, so the report-rendering
   * path — the part a user actually reads — is testable without a WebView.
   */
  probe?: (request: ProbeRequest) => Promise<ProbeReply | undefined>;
}

/**
 * What this shell's prober is, stamped into `Evidence.collector`.
 *
 * Declared here rather than inside the engine because the engine is the one
 * part that is identical on every platform: the same bundle runs behind an
 * `okhttp` probe on Android and a `WinRT` one on Windows, and a replayed bundle
 * has to say which of them produced it.
 */
const COLLECTOR_ID = 'swift-urlsession';

/** One completed audit, kept so it can be reopened without re-probing a site. */
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
  /**
   * The person pressed the button and has not yet acknowledged, this session,
   * that an audit leaves the device. Carries the already-normalized target, so
   * what the acknowledgement names is exactly what gets requested — not
   * whatever the input holds by the time they press through.
   */
  | { readonly kind: 'confirm'; readonly target: string }
  | { readonly kind: 'running'; readonly done: number; readonly total: number }
  | { readonly kind: 'error'; readonly message: string };

/**
 * How many previous audits the list keeps.
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
  /**
   * Whether this session has acknowledged that auditing makes outbound requests.
   *
   * In memory and session-scoped, exactly like the run history and for the same
   * reason: nothing about an audit is written to disk here, and a consent flag
   * persisted to the shared settings store would be the first thing this tab
   * ever recorded about a person's choices. Once per session is the honest
   * trade — it is a real acknowledgement rather than a dialog reflex, and it
   * costs one press.
   */
  const [acknowledged, setAcknowledged] = useState(false);
  const [runs, setRuns] = useState<readonly AuditRun[]>([]);
  /** The run being read, or `null` for the composer. */
  const [open, setOpen] = useState<AuditRun | null>(null);
  /**
   * The run whose removal is waiting to be confirmed, by `id`.
   *
   * One at a time: asking in a second row cancels the first, so the list can
   * never hold two armed destructive controls at once.
   */
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const copy = messages.audit;

  /**
   * Run one audit against an already-normalized target.
   *
   * Takes the target rather than reading the input, so "Audit again" on the
   * report screen re-runs the URL that report was produced from — not whatever
   * happens to be sitting in the composer behind it.
   */
  const runAudit = useCallback(
    async (target: string) => {
      setState({ kind: 'running', done: 0, total: MATRIX_HEADERS.length });
      try {
        // One engine call rather than collect-then-adjudicate here: the engine
        // is what stamps the report with the build that produced it, and a
        // report this screen adjudicated itself would carry no such stamp.
        const { report, evidence } = await runAuditEngine({
          url: target,
          probe: probe ?? bridgeProbe,
          collectorId: COLLECTOR_ID,
          uaPack: applyUaPack,
          onProgress: (done, total) => {
            // Guarded: a late leg settling after a failure must not resurrect
            // the running state over an error the person is reading.
            setState((current) =>
              current.kind === 'running' ? { ...current, done, total } : current,
            );
          },
        });
        const finished: AuditRun = {
          id: `${target} ${String(Date.now())}`,
          target,
          ranAt: new Date().toISOString(),
          report,
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
          message: error instanceof ProbeUnavailableError ? copy.noBridge : copy.failed,
        });
        // A failed re-run returns to the composer, where the error belongs —
        // leaving the previous report on screen under a failed re-run would
        // make a stale document look like the fresh one.
        setOpen(null);
      }
    },
    [applyUaPack, copy, probe],
  );

  /**
   * The composer's button: normalize what was typed, then either ask for the
   * outbound-request acknowledgement or run.
   *
   * The gate sits here rather than inside `runAudit` on purpose: "Audit again"
   * on the report screen also runs, and reaching a report at all means the
   * acknowledgement was already given this session. Asking a second time for
   * the same target would be theatre, not consent.
   */
  const runTyped = useCallback(async () => {
    const target = normalizeAuditUrl(url);
    if (target === null) {
      setState({ kind: 'error', message: copy.invalidUrl });
      return;
    }
    if (!acknowledged) {
      setState({ kind: 'confirm', target });
      return;
    }
    await runAudit(target);
  }, [url, copy, runAudit, acknowledged]);

  /** Pressed through the acknowledgement: remember it, then run that target. */
  const confirmRun = useCallback(
    async (target: string) => {
      setAcknowledged(true);
      await runAudit(target);
    },
    [runAudit],
  );

  /**
   * Drop one audit from the list, once its row has confirmed.
   *
   * Confirmed rather than immediate, because "nothing was written to disk" cuts
   * both ways: it also means there is no copy to restore from. Getting the row
   * back costs another full matrix against somebody else's server, so a
   * mis-tap spends real requests on a third party — which is the cost this tab
   * is otherwise careful about everywhere else.
   */
  const removeRun = useCallback((id: string) => {
    setRuns((previous) => previous.filter((entry) => entry.id !== id));
    setConfirmingRemoval(null);
  }, []);

  // Both screens share one scroller, so a report opened from halfway down the
  // history list would otherwise start halfway down. Layout effect, not effect:
  // the reset lands before paint, so no frame shows the wrong offset.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [open]);

  // The acknowledgement is a SCREEN, like the report, not a panel under the
  // composer. Below a heading, an intro, the URL box and the statute opt-in
  // with its explanation, its two buttons landed under the fold on a phone —
  // and a confirmation whose "Cancel" is off screen is not a confirmation.
  // Giving it the screen also gives it the weight it should have: this is the
  // one moment Movar reaches a server it does not own.
  if (state.kind === 'confirm') {
    const target = state.target;
    return (
      <div className="tool audit-screen">
        <header className="audit-screen-head">
          <p className="audit-confirm-title">
            <Globe className="ico" aria-hidden="true" />
            {copy.confirm.title}
          </p>
          <h1 className="audit-screen-title">{hostOf(target)}</h1>
          <p className="audit-screen-target">{target}</p>
        </header>
        <p className="audit-confirm-body">{copy.confirm.body(hostOf(target))}</p>
        <ul className="audit-confirm-points">
          {copy.confirm.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <div className="audit-confirm-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setState({ kind: 'idle' });
            }}
          >
            {copy.confirm.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void confirmRun(target);
            }}
          >
            <FileSearch className="ico" aria-hidden="true" />
            {copy.confirm.proceed}
          </button>
        </div>
        <p className="audit-confirm-once">{copy.confirm.once}</p>
      </div>
    );
  }

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
          <FileSearch className="ico" aria-hidden="true" />
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
          {/* `.sec` is a flex column with no gap — only `.sec-body` carries a
              margin — so the note and the list sat flush against each other.
              One stacking wrapper, same as the explainer below. */}
          <div className="sec-body audit-previous">
            {/* Stated once, next to the thing it is about. Nothing here is
                written to disk — see MAX_REMEMBERED_RUNS — and a reader who is
                building a case against a company needs to know that BEFORE
                they close the app, not after. */}
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
                  confirming={confirmingRemoval === entry.id}
                  onOpen={() => {
                    setOpen(entry);
                  }}
                  onAskRemove={() => {
                    setConfirmingRemoval(entry.id);
                  }}
                  onCancelRemove={() => {
                    setConfirmingRemoval(null);
                  }}
                  onRemove={() => {
                    removeRun(entry.id);
                  }}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* What this tool IS, before what it costs to run. Below the composer,
          not above it: someone who already knows should not scroll past an
          explainer to reach the URL box, and someone who does not is reading
          in the one place they can act on it — the sections a first-timer
          hits after the button they were not sure about pressing. */}
      <section className="sec">
        <h2 className="sec-title">{copy.about.title}</h2>
        <div className="sec-body audit-about">
          <p>{copy.about.body}</p>
          <ul className="limits">
            {copy.about.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </section>

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

/** When an audit ran, in the host's locale. Falls back to the raw stamp. */
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
 * One previous audit. Leads with the headline it produced, because that is what
 * makes a list of past runs worth having — a row that only said "movar.fyi,
 * 13:57" would make you open every one to find the one that failed.
 */
function RunRow({
  entry,
  copy,
  locale,
  confirming,
  onOpen,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: Readonly<{
  entry: AuditRun;
  copy: HostMessages['audit'];
  locale: HostLocale;
  /** This row is asking whether to discard itself. */
  confirming: boolean;
  onOpen: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}>): JSX.Element {
  const broken = entry.report.brokenPromises;
  // The question replaces the row rather than opening a dialog over it: the row
  // IS what gets destroyed, so it is the honest place to ask, and a modal for a
  // list entry weighs more than the act. Cancel leads, and Remove is the only
  // thing on this screen tinted danger.
  if (confirming) {
    return (
      <li className="audit-run-row is-confirming">
        <p className="audit-run-confirm-question">{copy.removeConfirm.question}</p>
        <div className="audit-run-confirm-actions">
          <button type="button" className="btn audit-run-confirm-cancel" onClick={onCancelRemove}>
            {copy.removeConfirm.cancel}
          </button>
          <button type="button" className="btn audit-run-confirm-go" onClick={onRemove}>
            {copy.removeConfirm.confirm}
          </button>
        </div>
      </li>
    );
  }
  return (
    // Two sibling controls under one frame, never a button inside a button:
    // opening and discarding are different intents, and nesting them would be
    // invalid markup that a keyboard could not separate. The `<li>` carries the
    // border so the remove control sits INSIDE the row it acts on.
    <li className={cn('audit-run-row', broken > 0 && 'is-fail')}>
      <button type="button" className="audit-run" onClick={onOpen}>
        <span className="audit-run-mark" aria-hidden="true">
          {broken > 0 ? <AlertTriangle className="ico" /> : <Check className="ico" />}
        </span>
        <span className="audit-run-text">
          <span className="audit-run-target">{prettyTarget(entry.target)}</span>
          <span className="audit-run-meta">
            {broken > 0 ? copy.brokenPromises(broken) : copy.noBrokenPromises} ·{' '}
            {ranAtLabel(entry.ranAt, locale)}
          </span>
        </span>
        <ChevronRight className="ico audit-run-chevron" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="audit-run-remove"
        // Names the target: every row's control would otherwise read "Remove".
        aria-label={copy.removeRun(prettyTarget(entry.target))}
        onClick={onAskRemove}
      >
        <X className="ico" aria-hidden="true" />
      </button>
    </li>
  );
}
