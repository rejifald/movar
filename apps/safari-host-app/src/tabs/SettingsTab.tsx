import type { JSX } from 'react';
import type { SettingsSource } from '../bridge';

/**
 * Settings tab — STUB. Phase C fills this in.
 *
 * Planned content: the shared `@movar/options-ui` sections
 * (`PrioritySection`, `PageContentSection`, `BlockedSection`,
 * `AllowlistSection`, plus `ContentToggle`) wrapped in `@movar/i18n`'s
 * `I18nProvider` (so the copy comes from the shared catalogue and can never
 * drift from the extension), wired to the native settings round-trip via the
 * injected {@link SettingsSource} — `source.read()` on mount, `source.write()`
 * on each change. This mirrors the extension's own options page
 * (`apps/extension/src/entrypoints/options/App.tsx`), differing only in the
 * storage port (native bridge here vs `chrome.storage` there).
 *
 * SEAM: this file is the entire Settings surface. The shell passes the
 * production `hostSettingsSource` from `bridge.ts`; Phase C's tests pass an
 * in-memory fake satisfying `SettingsSource`. The `.row` / `.field` /
 * `.locked-note` styles already live in `styles.css`.
 */
export interface SettingsTabProps {
  /** The settings read/write port. The shell injects the bridge-backed
   *  `hostSettingsSource`; tests inject a fake. Consumed in Phase C. */
  source: SettingsSource;
}

// The `source` prop is the Phase-C seam (read on mount, write on change); the
// shell already passes the bridge-backed `hostSettingsSource` so the contract
// is type-checked. The stub does not read settings yet — `no-unused-props` is
// silenced for `src/tabs/*` in this app's eslint config until Phase C consumes it.
export function SettingsTab(_props: Readonly<SettingsTabProps>): JSX.Element {
  return (
    <div className="card panel">
      <div className="stub-todo">
        {/* TODO(phase-c): I18nProvider + @movar/options-ui sections wired to
            props.source (read on mount, write on change). */}
        <strong>Settings</strong>
        <span>
          TODO — Phase C implements this tab in <code>src/tabs/SettingsTab.tsx</code>
        </span>
      </div>
    </div>
  );
}
