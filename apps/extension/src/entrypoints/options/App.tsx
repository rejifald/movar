import { useEffect, useState } from 'react';
import { CodeXml } from 'lucide-react';
import { browser } from 'wxt/browser';
import { FEEDBACK_URL, SOURCE_URL } from '@movar/brand';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings, UiLanguage } from '@movar/settings';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { I18nProvider, useI18n } from '../../lib/i18n';
import { LanguageSelector } from '../../components/LanguageSelector';
import { PrioritySection } from './PrioritySection';
import { PageContentSection } from './PageContentSection';
import { InsightsSection } from './InsightsSection';

// Resolved at module load so the footer can show it without re-reading the
// manifest on every render. Guarded for the static-serve preview where
// `browser.runtime` is shimmed but `getManifest()` may not be available.
const version = ((): string => {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return 'preview';
  }
})();

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
function OptionsBody({ settings, onChange, onChangeUiLanguage }: Readonly<OptionsBodyProps>) {
  const { t } = useI18n();

  return (
    // No outer card: Chrome's `chrome://extensions/?options=…` modal already
    // chromes the page (title bar + close button), so wrapping our content in
    // another bordered card duplicated that header. The standalone
    // `options.html` route still reads as the settings page because the
    // section headings are the only titles in view.
    //
    // Horizontal padding is generous on purpose — Chrome's options modal
    // sits ~500-580px wide, where the previous `px-5` (20px) felt cramped
    // against the right edge once items extended to their `max-w-md` cap.
    // `px-7` lands at the same 28px the original card used internally.
    <main className="bg-bg text-ink-strong min-h-screen px-7 py-6 font-sans sm:py-9">
      <div className="mx-auto max-w-3xl">
        {/* Two-column at lg+; stacks to single column inside Chrome's narrow
         *  options modal (~500px) and on phones. The aside loses its left
         *  border in the stacked layout so it doesn't look like a stray rule. */}
        <div className="grid gap-8 lg:grid-cols-[1fr_240px] lg:gap-14">
          <div className="space-y-10">
            <PrioritySection settings={settings} onChange={onChange} />
            <PageContentSection settings={settings} onChange={onChange} />
            <InsightsSection />
          </div>

          <aside className="text-ink-soft lg:border-border text-[12.5px] leading-[1.6] lg:border-l lg:pt-1 lg:pl-4">
            <b className="text-ink-strong mb-1 block text-[13px] font-semibold">
              {t.options.aside.howPriorityWorksTitle}
            </b>
            {t.options.aside.howPriorityWorks}
          </aside>
        </div>

        <footer className="text-ink-faint mt-10 flex items-start justify-between gap-3 text-[12px]">
          <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
            {t.feedback}
          </a>
          <div className="flex items-center gap-3">
            <SourceLink label={t.sourceCode} />
            <span className="font-mono text-[10.5px] tracking-wide">v{version}</span>
            <LanguageSelector value={settings.uiLanguage} onChange={onChangeUiLanguage} />
          </div>
        </footer>
      </div>
    </main>
  );
}

/** Source-code link to the public repo. A code glyph + label styled as inline
 *  text. Opens GitHub in a new tab with a safe `rel` (`noopener` keeps the
 *  opened tab from reaching back via `window.opener`). `CodeXml` is the same
 *  glyph the marketing hero pairs with its "Open source" badge. */
function SourceLink({ label }: Readonly<{ label: string }>) {
  return (
    <a
      href={SOURCE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-ink-strong inline-flex items-center gap-1 transition-colors"
    >
      <CodeXml size={13} aria-hidden="true" className="flex-shrink-0" />
      {label}
    </a>
  );
}
