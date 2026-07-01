import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Switch } from '@movar/ui';
import { I18nProvider, useI18n } from '@movar/i18n';
import { AllowlistSection, PageContentSection, PrioritySection } from '@movar/options-ui';
import type { MovarSettings } from '@movar/settings';
import type { SettingsSource } from '../bridge';
import { messagesFor } from '../i18n';
import type { HostLocale, HostMessages } from '../i18n';

/**
 * Settings tab — the extension's options surface, re-hosted in the wrapper app.
 *
 * Composes the shared `@movar/options-ui` sections (`PrioritySection`,
 * `PageContentSection` → `ContentToggle` → `ConcealModeField`, `AllowlistSection`)
 * under `@movar/i18n`'s `I18nProvider`, so every section's copy comes straight
 * from the shared catalogue and can never drift from the extension. It mirrors
 * the extension's own options `App.tsx` wiring (`apps/extension/src/entrypoints/
 * options/App.tsx`) — `source.read()` on mount into state, `source.write()` on
 * every change — differing only in the storage port: the injected
 * {@link SettingsSource} (native App-Group bridge) here vs `chrome.storage` there.
 *
 * Host-specific additions on top of the shared sections:
 *   - a **"Movar enabled" master switch** at the very top, bound to
 *     `settings.enabled` (host-only — the extension's options page has no master
 *     switch; it's wrapper chrome); and
 *   - the two contextual **aside notes** (how-priority-works, blocked-vs-exempt)
 *     the extension's options page shows in its side-rail, restored from the
 *     shared `options.aside.*` catalogue.
 *
 * Deliberately NOT rendered: the full `BlockedSection` (the add/remove
 * blocked-language UI) and the `LanguageSelector` (the wrapper has no UI-language
 * picker — the locale follows the device). Russian stays blocked by the
 * `enforceLockedLanguages` invariant in the settings port, not by any on-screen
 * affordance. The dense host layout uses the ported `styles.css` (`.panel`,
 * `.row`, `.field`); the sections keep their own Tailwind layout (the accepted
 * component-reuse drift).
 *
 * The panel stays hidden until `source.read()` resolves, so the form never
 * flashes defaults before the host's stored values arrive — the legacy
 * `panel.hidden = false` after `readSettings`.
 *
 * SEAM: the shell injects the bridge-backed `hostSettingsSource`; tests inject
 * an in-memory fake satisfying {@link SettingsSource}.
 */
export interface SettingsTabProps {
  /** The settings read/write port. The shell injects the bridge-backed
   *  `hostSettingsSource`; tests inject a fake. */
  source: SettingsSource;
}

export function SettingsTab({ source }: Readonly<SettingsTabProps>): JSX.Element | null {
  const [settings, setSettings] = useState<MovarSettings | null>(null);

  // Load the host's stored settings once on mount; until they arrive `settings`
  // is null and the whole tab renders nothing (the legacy hidden panel). The
  // mounted flag lives on a ref (not a closed-over `let`) so a `read()` that
  // resolves after unmount — e.g. a slow bridge round-trip — doesn't setState on
  // a torn-down component; reading `.current` also keeps the guard honest to the
  // linter (a closed-over boolean would be flow-narrowed to "always truthy").
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const loaded = await source.read();
      if (mountedRef.current) setSettings(loaded);
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [source]);

  // Apply + persist on every change — optimistic local state, fire-and-forget
  // write through the port (mirrors the extension's `update`).
  const update = (next: MovarSettings): void => {
    setSettings(next);
    void source.write(next);
  };

  // Pre-read window: render nothing (not even chrome) so the form never flashes
  // defaults before the host reports — matches `panel hidden` until readSettings.
  if (settings === null) return null;

  // The wrapper has no UI-language picker, so the options copy follows the
  // device: `uiLanguage: 'auto'` resolved against `navigator.language`, the same
  // locale the host shell resolves for its own chrome — the two stay in lock-step.
  return (
    <I18nProvider uiLanguage="auto" browserUiLanguage={navigator.language}>
      <SettingsBody settings={settings} onChange={update} />
    </I18nProvider>
  );
}

interface SettingsBodyProps {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

/** Split out so `useI18n()` resolves under the provider above (the shared
 *  catalogue for the aside notes + the resolved locale for the master switch). */
function SettingsBody({ settings, onChange }: Readonly<SettingsBodyProps>): JSX.Element {
  const { locale, t } = useI18n();
  // Host-only strings (the master switch) follow the same device locale the
  // provider resolved. `@movar/i18n`'s ResolvedLocale and the host's HostLocale
  // are the identical 'en' | 'uk' union (both derived from `navigator.language`),
  // so the provider's `locale` keys the host catalogue directly.
  const host: HostMessages = messagesFor(locale satisfies HostLocale);

  return (
    <div className="card panel">
      {/* Host-only master switch — the demoted "Movar enabled" toggle. Its
          label/help live in the host catalogue (the extension options page has
          no master switch). `.row` is the dense host row from styles.css. */}
      <div className="row">
        <div className="row-text">
          <span className="row-label">{host.settings.enabledLabel}</span>
          <span className="row-help">{host.settings.enabledHelp}</span>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(next) => {
            onChange({ ...settings, enabled: next });
          }}
          aria-label={host.settings.enabledLabel}
        />
      </div>

      {/* Shared options sections — copy + behaviour straight from the extension,
          so the wrapper and the options page never drift. */}
      <PrioritySection settings={settings} onChange={onChange} />
      {/* The two contextual notes gracious-bassi shows beside the settings
          sections (a desktop side-rail on the extension's own options page). The
          shared sections don't carry them, so they're restored here. */}
      <AsideNote
        title={t.options.aside.howPriorityWorksTitle}
        text={t.options.aside.howPriorityWorks}
      />
      <PageContentSection settings={settings} onChange={onChange} />
      <AllowlistSection settings={settings} onChange={onChange} />
      <AsideNote
        title={t.options.aside.blockedVsExemptTitle}
        text={t.options.aside.blockedVsExempt}
      />
    </div>
  );
}

/** A contextual "how it works" note under a settings section — the asides the
 *  extension's own options page shows in its side-rail, restored here (the
 *  shared sections don't carry them). Copy comes from `@movar/i18n`. */
function AsideNote({ title, text }: Readonly<{ title: string; text: string }>): JSX.Element {
  return (
    <div className="sec-note">
      <span className="sec-note-title">{title}</span>
      <span className="sec-note-text">{text}</span>
    </div>
  );
}
