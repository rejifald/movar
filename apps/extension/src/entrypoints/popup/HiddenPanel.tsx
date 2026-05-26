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
    <section className="mb-3 rounded-lg border border-slate-200 p-3">
      <h2 className="mb-1 text-xs font-semibold text-slate-700">On this page</h2>
      {hasHidden ? (
        <>
          <ul className="mb-2 space-y-0.5 text-xs text-slate-600">
            {hidden.languages.length > 0 ? (
              <li>
                Hidden from pickers:{' '}
                <span className="font-medium">
                  {hidden.languages.map(displayLanguage).join(', ')}
                </span>
              </li>
            ) : null}
            {hidden.containers > 0 ? (
              <li>
                Collapsed{' '}
                <span className="font-medium">
                  {hidden.containers} {hidden.containers === 1 ? 'picker' : 'pickers'}
                </span>{' '}
                with only one option left
              </li>
            ) : null}
          </ul>
          <button
            type="button"
            onClick={onRestore}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Show everything on this page
          </button>
          <p className="mt-1 text-[10px] text-slate-400">Reload the page to re-apply Movar.</p>
        </>
      ) : (
        <p className="text-xs text-slate-500">
          {hidden.userOverride
            ? 'Restored on this page — reload to re-apply.'
            : 'Nothing hidden here.'}
        </p>
      )}
    </section>
  );
}
