import { Microscope, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_HIGHLIGHT_GUTTER_REM } from '../lib/page-diagnostics';
import { Panel } from './Panel';
import type { PageDiagnostics } from '../types';

interface WidgetProps {
  snapshot: PageDiagnostics;
  /** Flash the source element with `gutterRem` of breathing room around it. */
  onHighlight: (id: string, gutterRem: number) => boolean;
  onRefresh: () => void;
}

/** z-index ceiling so the FAB/panel sit above any page chrome. */
const Z = 'z-[2147483647]';

/**
 * In-page surface: a floating action button (badged with how many items the
 * product would conceal here) toggling a floating panel that shows what the
 * product's page + picker models extract on this page. Mounted by the content
 * script into a shadow root, so it works in every browser — Safari included.
 */
export function Widget({ snapshot, onHighlight, onRefresh }: Readonly<WidgetProps>) {
  const [open, setOpen] = useState(false);
  const [gutter, setGutter] = useState(DEFAULT_HIGHLIGHT_GUTTER_REM);
  const { cards, pickers, blockedCount } = snapshot;
  const summary = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} · ${pickers.length} ${
    pickers.length === 1 ? 'picker' : 'pickers'
  } · ${blockedCount} would block`;

  return (
    <>
      {open ? (
        <section
          aria-label="Movar Diagnostics"
          // Fixed height so switching tabs doesn't resize the panel; clamped to
          // the viewport (minus the bottom offset + a margin) so it never runs
          // off-screen on short windows. The body scrolls when a tab overflows.
          className={`text-ink border-border bg-surface-2 fixed right-4 bottom-[76px] flex h-[480px] max-h-[calc(100vh_-_92px)] w-[380px] flex-col overflow-hidden rounded-xl border shadow-2xl ${Z}`}
        >
          <header className="border-border bg-surface-2 flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
            <div>
              <h1 className="text-ink-strong text-[13px] font-semibold">Movar Diagnostics</h1>
              <p className="text-ink-faint font-mono text-[10.5px]">{summary}</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onRefresh}
                aria-label="Refresh"
                title="Refresh"
                className="text-ink-faint hover:text-ink-strong rounded p-1.5 transition-colors"
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                aria-label="Close"
                title="Close"
                className="text-ink-faint hover:text-ink-strong rounded p-1.5 transition-colors"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Panel snapshot={snapshot} onHighlight={(id) => onHighlight(id, gutter)} />
          </div>

          <div className="border-border flex items-center justify-between gap-3 border-t px-3.5 py-2">
            <p className="text-ink-faint text-[10.5px] leading-snug">
              Its own read of the product’s models. Stays on this device.
            </p>
            <label className="text-ink-faint flex shrink-0 items-center gap-1 font-mono text-[10px]">
              gutter
              <input
                type="number"
                min={0}
                step={0.25}
                value={gutter}
                onChange={(e) => {
                  setGutter(Math.max(0, Number.parseFloat(e.target.value) || 0));
                }}
                aria-label="Highlight gutter (rem)"
                className="border-border bg-surface text-ink-strong w-11 rounded border px-1 py-0.5 text-right text-[10px]"
              />
              rem
            </label>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-label={`Movar Diagnostics — ${blockedCount} would block`}
        title="Movar Diagnostics"
        className={`bg-accent text-accent-on fixed right-4 bottom-4 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 ${Z}`}
      >
        <Microscope size={20} aria-hidden="true" />
        {blockedCount > 0 ? (
          <span className="bg-danger text-danger-on absolute -top-1 -right-1 min-w-[18px] rounded-full px-1 py-px text-center font-mono text-[10px] leading-none font-semibold">
            {blockedCount > 99 ? '99+' : blockedCount}
          </span>
        ) : null}
      </button>
    </>
  );
}
