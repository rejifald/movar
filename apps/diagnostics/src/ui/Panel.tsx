import { Check, ClipboardCopy, Crosshair, Moon, SearchX, Sun, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { buildFixtureSnippet } from '../lib/fixture-snippet';
import { languageName } from '../lib/language-name';
import type {
  DiagCard,
  DiagPicker,
  DiagSignal,
  PageDiagnostics,
  PageLanguageDiag,
  PageModeDiag,
} from '../types';

/** Scroll to + flash a node behind a snapshot id. Returns whether it was found. */
type HighlightFn = (id: string) => boolean;

interface PanelProps {
  snapshot: PageDiagnostics;
  onHighlight: HighlightFn;
}

const RUNG_METHOD: Record<string, string> = {
  '1': 'distinctive letters',
  '2a': 'function words',
  '2b': 'frequent words',
  '3': 'letter trigrams',
};

type TabId = 'content' | 'pickers' | 'mode' | 'language';

/**
 * Read-only window onto what the **product's own models** detect on this page,
 * split into tabs: content cards, language pickers, page mode (light/dark), and
 * page language (the sync redirect-signal chain). Mounted in a shadow root.
 */
export function Panel({ snapshot, onHighlight }: PanelProps) {
  const [tab, setTab] = useState<TabId>('content');
  const tabs: { id: TabId; label: string; badge: number | null }[] = [
    { id: 'content', label: 'Content', badge: snapshot.cards.length || null },
    { id: 'pickers', label: 'Pickers', badge: snapshot.pickers.length || null },
    { id: 'mode', label: 'Page mode', badge: null },
    { id: 'language', label: 'Page lang', badge: null },
  ];

  return (
    <div>
      <div
        role="tablist"
        className="border-border bg-surface-2 sticky top-0 z-10 flex border-b px-1.5"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1 border-b-2 px-2.5 py-2 text-[11.5px] transition-colors ${
              tab === t.id
                ? 'border-accent text-ink-strong font-medium'
                : 'text-ink-faint hover:text-ink-soft border-transparent'
            }`}
          >
            {t.label}
            {t.badge === null ? null : (
              <span className="bg-surface-3 text-ink-soft rounded-full px-1 font-mono text-[9px]">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === 'content' ? (
          <ContentSection snapshot={snapshot} onHighlight={onHighlight} />
        ) : null}
        {tab === 'pickers' ? (
          <PickerSection pickers={snapshot.pickers} onHighlight={onHighlight} />
        ) : null}
        {tab === 'mode' ? <ModeSection mode={snapshot.pageMode} /> : null}
        {tab === 'language' ? <LanguageSection lang={snapshot.pageLanguage} /> : null}
      </div>
    </div>
  );
}

// ── Content tab ────────────────────────────────────────────────────────────

function ContentSection({ snapshot, onHighlight }: PanelProps) {
  const { cards, cardLangCounts, extractor } = snapshot;
  if (extractor === null) {
    return (
      <p className="text-ink-faint text-[11.5px] leading-snug">
        No content model for this site — the product extracts content cards on Google &amp; YouTube
        only.
      </p>
    );
  }
  if (cards.length === 0) {
    return (
      <p className="text-ink-faint text-[11.5px]">No content cards found yet ({extractor}).</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-faint font-mono text-[10px]">extractor · {extractor}</p>
      <div className="flex flex-wrap gap-1">
        {Object.entries(cardLangCounts).map(([lang, n]) => (
          <span
            key={lang}
            className="border-border bg-surface text-ink-soft rounded-full border px-2 py-0.5 font-mono text-[10px]"
          >
            {languageName(lang)} ×{n}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <CardRow key={card.id} card={card} onHighlight={onHighlight} />
        ))}
      </ul>
    </div>
  );
}

function CardRow({ card, onHighlight }: { card: DiagCard; onHighlight: HighlightFn }) {
  const method = card.rung === null ? null : RUNG_METHOD[String(card.rung)];
  return (
    <li className="border-border bg-surface rounded-lg border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="border-border text-ink-faint rounded border px-1 py-px font-mono text-[9px] uppercase">
            {card.kind}
          </span>
          <span
            className={`text-[12.5px] font-medium ${card.blocked ? 'text-danger-deep' : 'text-ink-strong'}`}
          >
            {languageName(card.language)}
          </span>
          {card.blocked ? (
            <span className="bg-danger-soft text-danger-deep rounded px-1 py-px font-mono text-[9px] font-semibold uppercase">
              block
            </span>
          ) : null}
          <FrancMark card={card} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <HighlightButton id={card.id} onHighlight={onHighlight} />
          <CopyFixtureButton card={card} />
        </div>
      </div>
      {method ? <p className="text-ink-faint mt-1 font-mono text-[9.5px]">via {method}</p> : null}
      <p
        className="border-border text-ink mt-1.5 line-clamp-2 border-l-2 pl-2 text-[11.5px] leading-snug"
        dir="auto"
      >
        {card.sample}
      </p>
    </li>
  );
}

/** Franc cross-check marker: ✓ agrees, ⚠ disagrees (a calibration miss). */
function FrancMark({ card }: { card: DiagCard }) {
  if (card.francAgree === null) return null;
  if (card.francAgree) {
    return (
      <span title={`franc agrees (${card.francLanguage})`} className="text-accent-deep">
        <Check size={12} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      title={`franc disagrees: ${card.francLanguage}`}
      className="text-danger flex items-center gap-0.5 font-mono text-[9.5px]"
    >
      <TriangleAlert size={12} aria-hidden="true" />
      {card.francLanguage}
    </span>
  );
}

// ── Pickers tab ──────────────────────────────────────────────────────────────

function PickerSection({
  pickers,
  onHighlight,
}: {
  pickers: DiagPicker[];
  onHighlight: HighlightFn;
}) {
  if (pickers.length === 0) {
    return <p className="text-ink-faint text-[11.5px]">No language picker detected.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {pickers.map((picker) => (
        <li key={picker.id} className="border-border bg-surface rounded-lg border p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-1 flex-wrap gap-1">
              {picker.languages.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onHighlight(lang.id)}
                  title={`Show on page${lang.active ? ' (active)' : ''}${lang.blocked ? ' — blocked' : ''}`}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                    lang.blocked
                      ? 'border-danger-soft bg-danger-soft text-danger-deep'
                      : 'border-border bg-surface text-ink-soft hover:text-ink-strong'
                  }`}
                >
                  {lang.active ? '● ' : ''}
                  {languageName(lang.code)}
                </button>
              ))}
            </div>
            <HighlightButton id={picker.id} onHighlight={onHighlight} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Page-mode tab ────────────────────────────────────────────────────────────

function ModeSection({ mode }: { mode: PageModeDiag | null }) {
  if (mode === null) {
    return <p className="text-ink-faint text-[11.5px]">Page-mode detection unavailable.</p>;
  }
  const Icon = mode.verdict === 'dark' ? Moon : Sun;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="border-border bg-surface text-ink-strong flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold capitalize">
          <Icon size={15} aria-hidden="true" />
          {mode.verdict}
        </span>
        <span className="text-ink-faint text-[11px]">decided by {mode.decidedBy}</span>
      </div>
      <SignalList signals={mode.signals} />
    </div>
  );
}

// ── Page-language tab ────────────────────────────────────────────────────────

function LanguageSection({ lang }: { lang: PageLanguageDiag }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`border-border bg-surface rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold ${
            lang.blocked ? 'text-danger-deep' : 'text-ink-strong'
          }`}
        >
          {lang.verdict ? languageName(lang.verdict) : 'None detected'}
        </span>
        {lang.blocked ? (
          <span className="bg-danger-soft text-danger-deep rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase">
            blocked
          </span>
        ) : null}
      </div>
      <SignalList signals={lang.signals} format={languageName} />
    </div>
  );
}

/** Shared signal-chain renderer: each input row with its resolved value (or —). */
function SignalList({
  signals,
  format,
}: {
  signals: DiagSignal[];
  format?: (v: string) => string;
}) {
  if (signals.length === 0) {
    return <p className="text-ink-faint text-[11.5px]">No signals.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {signals.map((s) => (
        <li
          key={s.label}
          className="border-border flex items-center justify-between gap-2 border-b pb-1.5 last:border-0"
        >
          <span className="text-ink-faint font-mono text-[10.5px]">{s.label}</span>
          <span
            className={`text-[11.5px] ${s.value ? 'text-ink-strong font-medium' : 'text-ink-faint'}`}
          >
            {s.value ? (format ? format(s.value) : s.value) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Shared row actions ───────────────────────────────────────────────────────

function HighlightButton({ id, onHighlight }: { id: string; onHighlight: HighlightFn }) {
  const [missing, setMissing] = useState(false);
  const handle = (): void => {
    const found = onHighlight(id);
    setMissing(!found);
    if (!found) globalThis.setTimeout(() => setMissing(false), 1800);
  };
  const label = missing ? "Couldn't find it on the page" : 'Show on page';
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      title={label}
      className="text-ink-faint hover:text-ink-strong rounded p-1 transition-colors"
    >
      {missing ? (
        <SearchX size={13} aria-hidden="true" />
      ) : (
        <Crosshair size={13} aria-hidden="true" />
      )}
    </button>
  );
}

function CopyFixtureButton({ card }: { card: DiagCard }) {
  const [copied, setCopied] = useState(false);
  const handle = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(buildFixtureSnippet(card));
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const label = copied ? 'Copied fixture' : 'Copy as test fixture';
  return (
    <button
      type="button"
      onClick={() => void handle()}
      aria-label={label}
      title={label}
      className="text-ink-faint hover:text-ink-strong rounded p-1 transition-colors"
    >
      {copied ? (
        <Check size={13} aria-hidden="true" className="text-accent-deep" />
      ) : (
        <ClipboardCopy size={13} aria-hidden="true" />
      )}
    </button>
  );
}
