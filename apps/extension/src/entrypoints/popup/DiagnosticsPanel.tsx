import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { DetectionDivergence, DiagnosticsSummary } from '@movar/shared';
import { useI18n, type Messages } from '../../lib/i18n';

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsSummary | null;
  /** The `diagnostics` setting — when off, the panel renders nothing even if a
   *  stale summary is still in component state. Self-gating keeps the popup's
   *  body free of a wrapping conditional. */
  enabled: boolean;
}

/**
 * Popup viewer for on-device shadow-oracle divergences (see
 * docs/per-snippet-language-detection.md). Rendered only when the `diagnostics`
 * setting is on. Read-only window onto a local-only ring buffer — nothing here
 * is ever persisted or sent anywhere.
 */
export function DiagnosticsPanel({ diagnostics, enabled }: DiagnosticsPanelProps) {
  const { t } = useI18n();
  if (!enabled || diagnostics === null) return null;

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-1 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>{t.diagnostics.title}</span>
        <span className="text-ink-soft">{t.diagnostics.count(diagnostics.total)}</span>
      </h5>
      <p className="text-ink-faint mb-3 text-[11px] leading-snug">{t.diagnostics.note}</p>
      {diagnostics.recent.length > 0 ? (
        <ul className="space-y-2">
          {diagnostics.recent.map((d) => (
            <DivergenceRow key={`${d.timestamp}-${d.domain}-${d.sample}`} divergence={d} t={t} />
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft text-[12.5px]">{t.diagnostics.empty}</p>
      )}
    </section>
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

interface DivergenceRowProps {
  divergence: DetectionDivergence;
  t: Messages;
}

function DivergenceRow({ divergence, t }: DivergenceRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toFixture(divergence));
      setCopied(true);
    } catch {
      // Clipboard blocked (denied permission / insecure context) — no recovery.
    }
  };

  return (
    <li className="border-border bg-surface-2 rounded-md border px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px]">
          <span className="text-ink-strong font-medium">{divergence.classifier.language}</span>
          <span className="text-ink-faint"> rung {String(divergence.classifier.rung)} </span>
          <span className="text-ink-faint">≠</span>{' '}
          <span className="text-ink-strong font-medium">{divergence.oracle.language}</span>
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? t.diagnostics.copied : t.diagnostics.copy}
          title={copied ? t.diagnostics.copied : t.diagnostics.copy}
          className="text-ink-faint hover:text-ink-strong inline-flex flex-shrink-0 items-center transition-colors"
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        </button>
      </div>
      <p className="text-ink-soft mt-1 line-clamp-2 text-[11.5px]" dir="auto">
        {divergence.sample}
      </p>
      <p className="text-ink-faint mt-0.5 font-mono text-[10px]">{divergence.domain}</p>
    </li>
  );
}
