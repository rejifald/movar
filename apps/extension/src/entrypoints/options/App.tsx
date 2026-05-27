import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { FEEDBACK_URL, defaultSettings, type MovarSettings } from '@movar/shared';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { BrandMark } from '../../components/BrandMark';
import { PrioritySection } from './PrioritySection';
import { BlockedSection } from './BlockedSection';
import { AllowlistSection } from './AllowlistSection';
import { PageContentSection } from './PageContentSection';

const version = browser.runtime.getManifest().version;

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
    })();
  }, []);

  const update = (next: MovarSettings): void => {
    setSettings(next);
    void persistSettings(next);
  };

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
          <div className="space-y-10">
            <PrioritySection settings={settings} onChange={update} />
            <BlockedSection settings={settings} onChange={update} />
            <AllowlistSection settings={settings} onChange={update} />
            <PageContentSection settings={settings} onChange={update} />
          </div>

          <aside className="border-border text-ink-soft border-l pt-1 pl-4 text-[12.5px] leading-[1.6]">
            <b className="text-ink-strong mb-1 block text-[13px] font-semibold">
              How priority works
            </b>
            Movar negotiates each request with the site&apos;s available languages. If a site offers
            Ukrainian, it serves Ukrainian. If only English, English. If only Russian, Movar tries
            to switch you away.
            <b className="text-ink-strong mt-4 mb-1 block text-[13px] font-semibold">
              Blocked vs exempt
            </b>
            <em>Blocked</em> languages trigger an automatic switch away.
            <em> Exempt</em> sites are ignored entirely — Movar does nothing on them.
          </aside>
        </div>
      </div>

      <footer className="text-ink-faint mx-auto mt-6 max-w-3xl px-1 text-center text-[12px]">
        <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
          Send feedback
        </a>
      </footer>
    </main>
  );
}
