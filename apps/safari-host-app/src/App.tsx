import { Info, Languages, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { hostSettingsSource, useHostState } from './bridge';
import type { HostState } from './bridge';
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
 * The shell owns ONLY the chrome: the three-tab structure (Detector / Settings
 * / About), the bottom iOS-style tab bar with its roving-tabindex + arrow-key
 * navigation (ported from `Script.js` `initTabs()`), and the platform reveal.
 * Each tab's CONTENT is a separate, clearly-labelled file under `src/tabs/`
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

interface TabDef {
  id: TabId;
  icon: LucideIcon;
  /** Picks the host-only label out of the resolved catalogue. */
  label: (messages: HostMessages) => string;
}

/** Bar order matches the static `Main.html`: Detector, Settings, About. */
const TABS: readonly TabDef[] = [
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

  return (
    <>
      <BrandBar />
      <TabBar messages={messages} active={active} onSelect={setActive} />
      <main className="app">
        <TabPanel id="detector" active={active}>
          <DetectorTab messages={messages} />
        </TabPanel>
        <TabPanel id="settings" active={active}>
          <SettingsTab source={hostSettingsSource} />
        </TabPanel>
        <TabPanel id="about" active={active}>
          <AboutTab messages={messages} state={state} />
        </TabPanel>
      </main>
    </>
  );
}

/** Apply `platform-ios` / `platform-mac` to `<body>` for the reported platform
 *  and clear the other, so the ported platform-conditional CSS resolves. */
function useReflectPlatform(platform: HostState['platform'] | undefined): void {
  useEffect(() => {
    const { body } = document;
    body.classList.toggle('platform-ios', platform === 'ios');
    body.classList.toggle('platform-mac', platform === 'mac');
  }, [platform]);
}

/**
 * The fixed top app-bar — the "r." brand mark + "Movar" wordmark, on every tab
 * (matching gracious-bassi's `<header class="appbar">`). The mark is the
 * inlined `ic-brand` glyph: a rounded square (`currentColor` = `--ink-strong`),
 * the accent dot, and the Manrope "r" (`--brand-letter`), so it reads as Movar,
 * not an Apple-generic WebView.
 */
function BrandBar(): JSX.Element {
  return (
    <header className="appbar">
      <svg className="brand-mark" viewBox="0 0 128 128" aria-hidden="true">
        <rect x="6" y="6" width="116" height="116" rx="28" fill="currentColor" />
        <text
          x="56"
          y="100"
          textAnchor="middle"
          fontFamily="Manrope, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="96"
          letterSpacing="-0.02em"
          className="brand-letter"
        >
          r
        </text>
        <circle cx="89.6" cy="90.4" r="9.6" className="brand-dot" />
      </svg>
      <span className="wordmark">Movar</span>
    </header>
  );
}

interface TabBarProps {
  messages: HostMessages;
  active: TabId;
  onSelect: (id: TabId) => void;
}

/**
 * The fixed bottom tab bar: a `role="tablist"` of three `role="tab"` buttons,
 * each a lucide icon over its label. Implements the roving-tabindex + arrow-key
 * pattern ported from `Script.js` `initTabs()`:
 *   - exactly one tab is in the tab order at a time (`tabIndex` 0 on the active
 *     tab, -1 on the rest); a click or arrow-key selects;
 *   - ArrowRight / ArrowDown → next tab, ArrowLeft / ArrowUp → previous, both
 *     wrapping around, and the newly-selected tab takes focus.
 */
function TabBar({ messages, active, onSelect }: Readonly<TabBarProps>): JSX.Element {
  // One ref per tab button so an arrow-key selection can move focus to the
  // newly-active tab (roving tabindex requires the target be focused, not just
  // tabbable).
  const buttonsRef = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    onSelect(next.id);
    buttonsRef.current[next.id]?.focus();
  };

  // The tab bar is a plain `<div role="tablist">` (not `<nav>`): a `<nav>`
  // carries an implicit `navigation` landmark that conflicts with the
  // `tablist` role, and the ARIA tabs pattern is the right semantics here.
  return (
    <div className="tabs" role="tablist" aria-label="Movar">
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              buttonsRef.current[tab.id] = node;
            }}
            type="button"
            className="tab"
            role="tab"
            id={`tab-${tab.id}-btn`}
            data-tab={tab.id}
            aria-selected={selected}
            aria-controls={`tab-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onSelect(tab.id);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
          >
            <Icon className="tab-ico" aria-hidden="true" />
            <span className="tab-label">{tab.label(messages)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A single `role="tabpanel"`, hidden unless its tab is active. Keeps the
 *  `aria-labelledby` ↔ tab-button id wiring the static markup had, and uses the
 *  `hidden` attribute (which `styles.css` forces to win) so inactive panels are
 *  fully removed, not just visually covered. */
function TabPanel({
  id,
  active,
  children,
}: Readonly<{ id: TabId; active: TabId; children: JSX.Element }>): JSX.Element {
  return (
    <section
      className="tabpanel"
      id={`tab-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}-btn`}
      hidden={id !== active}
    >
      {children}
    </section>
  );
}
