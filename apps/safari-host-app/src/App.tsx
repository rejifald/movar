import { Info, Languages, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { hostSettingsSource, useHostState } from './bridge';
import type { HostState } from './bridge';
import { HostLayout, TabPanel } from './HostLayout';
import type { HostTabDef } from './HostLayout';
import { AboutTab } from './tabs/AboutTab';
import { DetectorTab } from './tabs/DetectorTab';
import { SettingsTab } from './tabs/SettingsTab';
import type { HostMessages } from './i18n';

/**
 * The unified Movar host shell, re-platformed from the static
 * `Base.lproj/Main.html` + `Script.js` to React while reusing the Phase-A
 * shared packages (`@movar/ui`, `@movar/options-ui`, `@movar/i18n`,
 * `@movar/settings`, `@movar/lang-detect`).
 *
 * The shell owns the three-tab structure (Detector / Settings / About) and the
 * platform reveal; the actual chrome — the fixed brand app-bar, the bottom
 * iOS-style tab bar (roving-tabindex + arrow-key nav, ported from `Script.js`
 * `initTabs()`), and the `<main class="app">` content wrapper — is
 * `./HostLayout`'s `HostLayout` component. This file composes `HostLayout`
 * with this app's tab definitions + tab panels and stays thin. Each tab's
 * CONTENT is a separate, clearly-labelled file under `src/tabs/`
 * (`DetectorTab` / `SettingsTab` / `AboutTab`) — those are STUBS that Phase C
 * fills in. The shell wires every seam Phase C needs (the settings port, the
 * resolved messages, the live host state) so the tabs drop in without touching
 * this file.
 *
 * PLATFORM GATING — mirrors the static screen exactly. The tab bar always
 * shows all three tabs (the static `<nav class="tabs">` carried no platform
 * class); platform only changes what the About tab renders inside its
 * enablement banner — iOS shows the "open the Settings app" path, macOS shows
 * the "Open Safari Settings" installer CTA. So the shell:
 *   - reflects the reported platform onto `<body class="platform-…">` (as
 *     `Script.js` did via `document.body.classList`), the hook the ported CSS
 *     and Phase C's banner read; and
 *   - threads the live `state` (which carries `platform` / `enabled` /
 *     `useSettings`) into `AboutTab`, where Phase C selects the banner.
 * Until Swift calls `show()`, `state` is `null` and the About banner stays
 * platform-neutral — the same pre-reveal behaviour the old CSS encoded
 * (`body:not(.platform-mac,.platform-ios) .status { display: none }`).
 */

/** The three tabs, in bar order. `id` is the stable key + the `data-tab`
 *  identity used by the keyboard nav and the panel wiring. */
type TabId = 'detector' | 'settings' | 'about';

/** Bar order matches the static `Main.html`: Detector, Settings, About. */
const TABS: readonly HostTabDef<TabId>[] = [
  { id: 'detector', icon: Languages, label: (m) => m.tabs.detector },
  { id: 'settings', icon: Settings, label: (m) => m.tabs.settings },
  { id: 'about', icon: Info, label: (m) => m.tabs.about },
];

export interface AppProps {
  /** Host-shell catalogue for the resolved locale (tab labels + the About
   *  enablement copy). The Settings tab gets its copy from `@movar/i18n`
   *  instead, so it never drifts from the extension. */
  messages: HostMessages;
}

export function App({ messages }: Readonly<AppProps>): JSX.Element {
  // Live native state feed. `null` until Swift calls `show()`. Drives both the
  // `<body>` platform class and the About tab's banner.
  const state = useHostState();
  const [active, setActive] = useState<TabId>('detector');

  // Reflect the reported platform onto <body>, exactly as `Script.js` did
  // (`document.body.classList.add('platform-' + platform)`). The ported CSS and
  // Phase C's enablement banner key off this class. Toggled (not just added) so
  // a focus-regain `show()` that ever changed platform stays consistent.
  useReflectPlatform(state?.platform);

  // The brand app-bar shows on the About tab everywhere EXCEPT macOS, where the
  // native window title bar already says "Movar" (so it'd be redundant in the
  // WebView). The functional tabs (Detector/Settings) never show it, and reclaim
  // the height. Pre-`show()` (platform not yet reported) still shows it — About
  // is the branded "about this app" screen, so it defaults to branded until we
  // learn we're on macOS. iOS About is the App Store `08-host-app-about` capture.
  const showBrand = active === 'about' && state?.platform !== 'mac';
  useReflectAppbar(showBrand);

  return (
    <HostLayout
      messages={messages}
      tabs={TABS}
      active={active}
      onSelect={setActive}
      showBrand={showBrand}
    >
      <>
        <TabPanel id="detector" active={active}>
          <DetectorTab messages={messages} />
        </TabPanel>
        <TabPanel id="settings" active={active}>
          <SettingsTab source={hostSettingsSource} />
        </TabPanel>
        <TabPanel id="about" active={active}>
          <AboutTab messages={messages} state={state} />
        </TabPanel>
      </>
    </HostLayout>
  );
}

/** Apply `platform-ios` / `platform-mac` to both `<html>` and `<body>` for the
 *  reported platform and clear the other. `<body>` is the hook the ported
 *  platform CSS reads; `<html>` additionally lets `styles.css` anchor `1rem` to
 *  iOS Dynamic Type (`html.platform-ios { font: -apple-system-body }`), which
 *  `<body>` can't do since `rem` derives from the root element. */
function useReflectPlatform(platform: HostState['platform'] | undefined): void {
  useEffect(() => {
    for (const element of [document.documentElement, document.body]) {
      element.classList.toggle('platform-ios', platform === 'ios');
      element.classList.toggle('platform-mac', platform === 'mac');
    }
  }, [platform]);
}

/** Mirror the brand app-bar's visibility onto `body.has-appbar`. The app-bar is
 *  `position: fixed`, so its 50px of vertical space has to be reserved by the
 *  body's `padding-top`; without the bar we drop that reservation (keeping only
 *  the safe-area inset, so content still clears the notch). Both the JSX render
 *  and this class must key off the same `showBrand`, or the padding and the bar
 *  disagree — see `styles.css`'s `body` / `body.has-appbar` rules. */
function useReflectAppbar(show: boolean): void {
  useEffect(() => {
    document.body.classList.toggle('has-appbar', show);
  }, [show]);
}
