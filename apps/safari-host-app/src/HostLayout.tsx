import { useRef } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { HostMessages } from './i18n';

/**
 * The host shell's structural chrome — the fixed brand app-bar, the bottom
 * tab bar (roving-tabindex `role="tablist"`), and the `<main class="app">`
 * content wrapper — extracted out of `App.tsx` so the composition has its own
 * clearly-named seam.
 *
 * PURELY STRUCTURAL: this is the exact same markup + the exact same class
 * names (`.appbar` / `.tabs` / `.app`) `App.tsx` rendered inline before the
 * extraction, moved verbatim. The real app and the App Store `08-host-app-
 * about.png` capture both walk this same tree, so their render is
 * byte-identical to pre-extraction — nothing about the fragile `100dvh` +
 * `position: fixed` app-bar/tab-bar layout (see `styles.css`'s `body` comment)
 * changes here. `App.tsx` now composes `HostLayout`, passing the tab
 * definitions + the tab panels as children, and stays thin.
 */

/** One entry in the bottom tab bar. `id` is the stable key + the `data-tab`
 *  identity the keyboard nav and the panel wiring key off. */
export interface HostTabDef<TabId extends string> {
  id: TabId;
  icon: LucideIcon;
  /** Picks the tab's label out of the resolved catalogue. */
  label: (messages: HostMessages) => string;
}

export interface HostLayoutProps<TabId extends string> {
  /** Host-shell catalogue — the tab labels the bar renders. */
  messages: HostMessages;
  /** The tab bar's entries, in bar order. */
  tabs: readonly HostTabDef<TabId>[];
  /** The currently-selected tab id. */
  active: TabId;
  /** Invoked with the newly-selected tab id (click or arrow-key). */
  onSelect: (id: TabId) => void;
  /** Whether to render the fixed brand app-bar. Gated by the caller (iOS +
   *  About tab only); macOS and the functional iOS tabs render without it. Must
   *  agree with the `body.has-appbar` class that reserves its space — see
   *  `App.tsx`'s `useReflectAppbar`. */
  showBrand: boolean;
  /** The tab panels — typically one `<TabPanel>` per entry in `tabs`,
   *  rendered inside `<main class="app">`. */
  children: JSX.Element;
}

/**
 * The full host chrome: `<BrandBar/>` + the tab bar + `<main class="app">`
 * wrapping `children`. Composes the same three pieces `App.tsx` used to
 * render inline, unchanged.
 */
export function HostLayout<TabId extends string>({
  messages,
  tabs,
  active,
  onSelect,
  showBrand,
  children,
}: Readonly<HostLayoutProps<TabId>>): JSX.Element {
  return (
    <>
      {showBrand ? <BrandBar /> : null}
      <TabBar tabs={tabs} messages={messages} active={active} onSelect={onSelect} />
      <main className="app">{children}</main>
    </>
  );
}

/**
 * The fixed top app-bar — the "r." brand mark + "Movar" wordmark. Rendered only
 * when the caller passes `showBrand` (iOS + About tab); macOS takes its "Movar"
 * from the native window title bar, and the functional iOS tabs go without it.
 * The mark is the inlined `ic-brand` glyph: a rounded square (`currentColor` =
 * `--ink-strong`), the accent dot, and the Manrope "r" (`--brand-letter`), so
 * it reads as Movar, not an Apple-generic WebView.
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

interface TabBarProps<TabId extends string> {
  tabs: readonly HostTabDef<TabId>[];
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
function TabBar<TabId extends string>({
  tabs,
  messages,
  active,
  onSelect,
}: Readonly<TabBarProps<TabId>>): JSX.Element {
  // One ref per tab button so an arrow-key selection can move focus to the
  // newly-active tab (roving tabindex requires the target be focused, not just
  // tabbable).
  const buttonsRef = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    onSelect(next.id);
    buttonsRef.current[next.id]?.focus();
  };

  // The tab bar is a plain `<div role="tablist">` (not `<nav>`): a `<nav>`
  // carries an implicit `navigation` landmark that conflicts with the
  // `tablist` role, and the ARIA tabs pattern is the right semantics here.
  return (
    <div className="tabs" role="tablist" aria-label="Movar">
      {tabs.map((tab, index) => {
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
export function TabPanel<TabId extends string>({
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
