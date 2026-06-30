import type { JSX } from 'react';
import type { HostState } from '../bridge';
import type { HostMessages } from '../i18n';

/**
 * About tab — STUB. Phase C fills this in.
 *
 * Planned content (ported from magical-snyder's `.about` card + the #168
 * onboarding `App.tsx`): the brand lockup (icon + "Movar" + subtitle), the
 * enablement banner that reacts to the native `show()` state, and the trust
 * row (Free / Open source / Nothing leaves your browser). The banner is a pure
 * function of {@link HostState}:
 *   - `state === null`            → brand + trust only (pre-`show()` window).
 *   - `platform === 'ios'`        → "Turn on Movar in the Settings app" + the
 *                                    Settings → Safari → Extensions chip path.
 *   - `platform === 'mac'`, off   → "Turn on Movar in Safari" + the macOS
 *                                    "Open Safari Settings" CTA
 *                                    (`openSafariPreferences()` from `bridge.ts`).
 *   - `platform === 'mac'`, on    → "Movar is on" + the manage CTA.
 * The `useSettings === false` (macOS ≤ 12) path swaps "Settings" → "Preferences".
 *
 * SEAM: this file is the entire About surface. The shell passes the resolved
 * `messages` and the live `state`; the `.about` / `.status` / `.chip` /
 * `.open-preferences` / `.trust` styles already live in `styles.css`.
 */
export interface AboutTabProps {
  /** Host-shell catalogue for the resolved locale. Consumed in Phase C. */
  messages: HostMessages;
  /** Latest native `show()` snapshot, or `null` before the host reports. */
  state: HostState | null;
}

// The `messages` + `state` props are the Phase-C seam (the show()-driven
// enablement banner); the shell already passes both so the contract is
// type-checked. The stub renders neither yet — `no-unused-props` is silenced
// for `src/tabs/*` in this app's eslint config until Phase C consumes them.
export function AboutTab(_props: Readonly<AboutTabProps>): JSX.Element {
  return (
    <div className="card about">
      <div className="stub-todo">
        {/* TODO(phase-c): brand lockup + show()-driven enablement banner +
            trust row, ported from magical-snyder's .about card. */}
        <strong>About</strong>
        <span>
          TODO — Phase C implements this tab in <code>src/tabs/AboutTab.tsx</code>
        </span>
      </div>
    </div>
  );
}
