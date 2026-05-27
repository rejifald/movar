import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { defaultSettings, type LanguageCode, type MovarSettings } from '@movar/shared';
import { getSettings } from '../../lib/settings';
import { BrandMark } from '../../components/BrandMark';

const version = browser.runtime.getManifest().version;

function displayLanguage(code: LanguageCode, locale?: string): string {
  try {
    const names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

function flagLetter(code: LanguageCode): string {
  return displayLanguage(code, code).charAt(0).toUpperCase();
}

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
    })();
  }, []);

  return (
    <main className="bg-bg text-ink-strong min-h-screen px-6 py-10 font-sans">
      <div className="border-border bg-surface mx-auto max-w-3xl overflow-hidden rounded-2xl border shadow-md">
        <header className="border-border flex items-center justify-between border-b px-7 py-4">
          <div className="flex items-center gap-2.5">
            <BrandMark size={22} className="text-ink-strong" title="Movar" />
            <span className="font-display text-ink-strong text-lg font-bold tracking-tight">
              Movar
            </span>
            <span className="text-ink-faint ml-1 font-mono text-[10.5px] font-normal tracking-wide">
              v{version}
            </span>
          </div>
          <nav className="flex gap-1">
            <span className="bg-surface-2 text-ink-strong rounded-md px-3 py-1.5 text-[13px] font-medium">
              Languages
            </span>
          </nav>
        </header>

        <div className="grid grid-cols-[1fr_240px] gap-14 px-7 py-9">
          <section>
            <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
              Language priority
            </h3>
            <p className="text-ink-soft mb-6 text-sm">
              Movar will request each site in this order; the first available wins.
            </p>

            <ol className="flex max-w-md flex-col gap-2">
              {settings.priority.map((code, i) => {
                const primary = i === 0;
                return (
                  <li
                    key={code}
                    className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
                      primary ? 'border-accent/30 bg-accent-surface' : 'border-border bg-surface-2'
                    }`}
                  >
                    <div className="text-ink-faint w-4 font-mono text-[11px]">{i + 1}</div>
                    <div
                      className={`font-display flex size-[22px] items-center justify-center rounded-full text-[10.5px] font-bold ${
                        primary ? 'bg-accent text-accent-on' : 'bg-surface-3 text-ink-strong'
                      }`}
                    >
                      {flagLetter(code)}
                    </div>
                    <div className="text-ink-strong flex-1 text-sm font-medium">
                      {displayLanguage(code, code)}
                      <span className="text-ink-soft ml-1.5 text-[13px] font-normal">
                        {displayLanguage(code, 'en')}
                      </span>
                    </div>
                    <div className="border-border bg-surface text-ink-soft rounded border px-1.5 py-0.5 font-mono text-[11px]">
                      {code}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className="border-border text-ink-soft border-l pt-1 pl-4 text-[12.5px] leading-[1.6]">
            <b className="text-ink-strong mb-1 block text-[13px] font-semibold">
              How priority works
            </b>
            Movar negotiates each request with the site&apos;s available languages. If a site offers
            Ukrainian, it serves Ukrainian. If only English, English. If only Russian, Movar strips
            the page from results entirely.
          </aside>
        </div>
      </div>
    </main>
  );
}
