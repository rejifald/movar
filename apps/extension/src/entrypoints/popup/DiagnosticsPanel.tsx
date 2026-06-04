import { ArrowRight, Check, Copy, Globe } from 'lucide-react';
import { useState } from 'react';
import type { DetectionDivergence, DiagnosticsSummary, LanguageCode } from '@movar/shared';
import { makeLanguageDisplay, useI18n, type Messages } from '../../lib/i18n';

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsSummary | null;
  /** The `diagnostics` setting — when off, the panel renders nothing even if a
   *  stale summary is still in component state. Self-gating keeps the popup's
   *  body free of a wrapping conditional. */
  enabled: boolean;
}

/** Cap on rows rendered in the popup; the rest live in the ring buffer (and the
 *  console). Keeps the popup from growing unboundedly on a busy session. */
const DISPLAY_CAP = 5;

/**
 * Popup viewer for on-device shadow-oracle divergences (see
 * docs/per-snippet-language-detection.md). Rendered only when the `diagnostics`
 * setting is on. Read-only window onto a local-only ring buffer — nothing here
 * is ever persisted or sent anywhere.
 */
export function DiagnosticsPanel({ diagnostics, enabled }: DiagnosticsPanelProps) {
  const { t, locale } = useI18n();
  if (!enabled || diagnostics === null) return null;

  const displayLanguage = makeLanguageDisplay(locale);

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-1 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>{t.diagnostics.title}</span>
        <span className="text-ink-soft">{t.diagnostics.count(diagnostics.total)}</span>
      </h5>
      <p className="text-ink-faint mb-3 text-[11px] leading-snug">{t.diagnostics.note}</p>
      <DivergenceList
        recent={diagnostics.recent}
        total={diagnostics.total}
        t={t}
        displayLanguage={displayLanguage}
      />
    </section>
  );
}

interface DivergenceListProps {
  recent: readonly DetectionDivergence[];
  total: number;
  t: Messages;
  displayLanguage: (code: LanguageCode) => string;
}

function DivergenceList({ recent, total, t, displayLanguage }: DivergenceListProps) {
  const shown = recent.slice(0, DISPLAY_CAP);
  if (shown.length === 0) {
    return <p className="text-ink-soft text-[12.5px]">{t.diagnostics.empty}</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {shown.map((d) => (
          <DivergenceRow
            key={`${d.timestamp}-${d.domain}-${d.sample}`}
            divergence={d}
            t={t}
            displayLanguage={displayLanguage}
          />
        ))}
      </ul>
      {total > shown.length ? (
        <p className="text-ink-faint mt-2.5 text-center font-mono text-[10px]">
          {t.diagnostics.more(shown.length, total)}
        </p>
      ) : null}
    </>
  );
}

interface DivergenceRowProps {
  divergence: DetectionDivergence;
  t: Messages;
  displayLanguage: (code: LanguageCode) => string;
}

function DivergenceRow({ divergence, t, displayLanguage }: DivergenceRowProps) {
  return (
    <li className="border-border bg-surface-2 rounded-lg border p-2.5">
      {/* Headline: the two verdicts, each labeled with its role, so it's clear
          which language Movar's fast classifier read and which the cross-check
          returned. The arrow reads "Movar's guess → the likelier reading". */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Verdict
            role={t.diagnostics.classifier}
            name={displayLanguage(divergence.classifier.language)}
            tone="movar"
          />
          <ArrowRight size={13} aria-hidden="true" className="text-ink-faint shrink-0" />
          <Verdict
            role={t.diagnostics.crossCheck}
            name={displayLanguage(divergence.oracle.language)}
            tone="check"
          />
        </div>
        <CopyFixtureButton divergence={divergence} t={t} />
      </div>

      {/* Method (which rung decided it) in plain language; the technical id
          stays in the tooltip + the copy-as-fixture payload for contributors. */}
      <p
        className="text-ink-soft mt-2 text-[11px]"
        title={`rung ${String(divergence.classifier.rung)}`}
      >
        {t.diagnostics.method(divergence.classifier.rung)}
      </p>

      <p
        className="border-border text-ink mt-1.5 line-clamp-2 border-l-2 pl-2 text-[11.5px] leading-snug"
        dir="auto"
      >
        {divergence.sample}
      </p>

      <p className="text-ink-faint mt-1.5 flex items-center gap-1 font-mono text-[10px]">
        <Globe size={10} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{divergence.domain}</span>
      </p>
    </li>
  );
}

interface VerdictProps {
  role: string;
  name: string;
  /** `movar` = the fast-pass classifier's read (neutral ink); `check` = the
   *  cross-check's read (accent, the likelier-correct reference). */
  tone: 'movar' | 'check';
}

function Verdict({ role, name, tone }: VerdictProps) {
  return (
    <div className="min-w-0">
      <div
        className={`truncate text-[12.5px] font-medium ${tone === 'check' ? 'text-accent-deep' : 'text-ink-strong'}`}
      >
        {name}
      </div>
      <div className="text-ink-faint font-mono text-[9.5px] tracking-[0.08em] uppercase">
        {role}
      </div>
    </div>
  );
}

/**
 * Serialise a divergence as a pasteable JSON test-fixture record. Both verdicts
 * ship verbatim — a divergence means one of them is wrong, but which is the
 * dev's call, so we don't bake in an `expect`.
 */
function toFixture(d: DetectionDivergence): string {
  return JSON.stringify(
    {
      text: d.sample,
      candidates: d.candidates,
      classifier: {
        language: d.classifier.language,
        rung: d.classifier.rung,
        margin: d.classifier.margin,
      },
      oracle: d.oracle,
      domain: d.domain,
    },
    null,
    2,
  );
}

function CopyFixtureButton({ divergence, t }: { divergence: DetectionDivergence; t: Messages }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toFixture(divergence));
      setCopied(true);
    } catch {
      // Clipboard blocked (denied permission / insecure context) — no recovery.
    }
  };

  const label = copied ? t.diagnostics.copied : t.diagnostics.copy;
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={label}
      title={label}
      className="text-ink-faint hover:text-ink-strong -m-1 shrink-0 p-1 transition-colors"
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}
