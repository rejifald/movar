import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { FEEDBACK_URL, defaultSettings, type MovarSettings, type UiLanguage } from '@movar/shared';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { I18nProvider, useI18n } from '../../lib/i18n';
import { BrandMark } from '../../components/BrandMark';
import { LanguageSelector } from '../popup/LanguageSelector';
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

  const setUiLanguage = (next: UiLanguage): void => {
    update({ ...settings, uiLanguage: next });
  };

  return (
    <I18nProvider uiLanguage={settings.uiLanguage}>
      <OptionsBody settings={settings} onChange={update} onChangeUiLanguage={setUiLanguage} />
    </I18nProvider>
  );
}

interface OptionsBodyProps {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
  onChangeUiLanguage: (next: UiLanguage) => void;
}

/** Split out so `useI18n()` resolves under the provider above. */
function OptionsBody({ settings, onChange, onChangeUiLanguage }: OptionsBodyProps) {
  const { t } = useI18n();

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
              {t.options.nav.languages}
            </span>
          </nav>
        </header>

        <div className="grid grid-cols-[1fr_240px] gap-14 px-7 py-9">
          <div className="space-y-10">
            <PrioritySection settings={settings} onChange={onChange} />
            <BlockedSection settings={settings} onChange={onChange} />
            <AllowlistSection settings={settings} onChange={onChange} />
            <PageContentSection settings={settings} onChange={onChange} />
          </div>

          <aside className="border-border text-ink-soft border-l pt-1 pl-4 text-[12.5px] leading-[1.6]">
            <b className="text-ink-strong mb-1 block text-[13px] font-semibold">
              {t.options.aside.howPriorityWorksTitle}
            </b>
            {t.options.aside.howPriorityWorks}
            <b className="text-ink-strong mt-4 mb-1 block text-[13px] font-semibold">
              {t.options.aside.blockedVsExemptTitle}
            </b>
            {t.options.aside.blockedVsExempt}
          </aside>
        </div>
      </div>

      <footer className="text-ink-faint mx-auto mt-6 flex max-w-3xl items-center justify-between px-1 text-center text-[12px]">
        <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
          {t.feedback}
        </a>
        <LanguageSelector value={settings.uiLanguage} onChange={onChangeUiLanguage} />
      </footer>
    </main>
  );
}
