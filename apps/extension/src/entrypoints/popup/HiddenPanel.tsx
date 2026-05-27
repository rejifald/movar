import type { HiddenSummary, LanguageCode } from '@movar/shared';

function displayLanguage(code: LanguageCode): string {
  try {
    const names = new Intl.DisplayNames(undefined, { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

interface HiddenPanelProps {
  hidden: HiddenSummary;
  onRestore: () => void;
}

export function HiddenPanel({ hidden, onRestore }: HiddenPanelProps) {
  const hasHidden = hidden.languages.length > 0 || hidden.containers > 0;

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>On this page</span>
      </h5>
      {hasHidden ? (
        <>
          <ul className="text-ink mb-3 space-y-1.5 text-[12.5px]">
            {hidden.languages.length > 0 ? (
              <li>
                Hidden from pickers:{' '}
                <span className="text-ink-strong font-medium">
                  {hidden.languages.map(displayLanguage).join(', ')}
                </span>
              </li>
            ) : null}
            {hidden.containers > 0 ? (
              <li>
                Collapsed{' '}
                <span className="text-ink-strong font-medium">
                  {hidden.containers} {hidden.containers === 1 ? 'picker' : 'pickers'}
                </span>{' '}
                with only one option left
              </li>
            ) : null}
          </ul>
          <button
            type="button"
            onClick={onRestore}
            className="border-border bg-surface-2 text-ink-strong hover:bg-surface-3 w-full rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors"
          >
            Show everything on this page
          </button>
          <p className="text-ink-faint mt-2 font-mono text-[10.5px]">
            Reload the page to re-apply Movar.
          </p>
        </>
      ) : (
        <p className="text-ink-soft text-[12.5px]">
          {hidden.userOverride
            ? 'Restored on this page — reload to re-apply.'
            : 'Nothing hidden here.'}
        </p>
      )}
    </section>
  );
}
