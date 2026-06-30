import type { JSX } from 'react';
import type { HostMessages } from '../i18n';

/**
 * Detector tab — STUB. Phase C fills this in.
 *
 * Planned content (ported from magical-snyder's `Script.js` `initTool()` + the
 * `.tool` card in `Main.html`): a paste-text area, Detect / Clear actions, and
 * a verdict box driven by `detectCyrillicLanguage` from `@movar/lang-detect`
 * (returns `{ language: 'uk' | 'ru' | 'unknown', ukScore, ruScore }`). Runs
 * entirely on-device; works with the extension off. The verdict copy ("No
 * Cyrillic language detected", "Language detection is unavailable") is
 * host-only and will be added to the host i18n catalogue under `detector.*`.
 *
 * SEAM: this file is the entire Detector surface. Phase C implements it here;
 * the shell wires it in via `<DetectorTab />` in `App.tsx` and the `.tool`
 * styles already live in `styles.css`.
 */
export interface DetectorTabProps {
  /** Host-shell catalogue for the resolved locale (verdict strings land here
   *  in Phase C). Accepted now so the shell→tab seam is stable. */
  messages: HostMessages;
}

// The `messages` prop is the Phase-C seam (verdict strings land in the host
// catalogue then); the shell already passes it so the contract is type-checked.
// The stub renders no copy yet — `no-unused-props` is silenced for `src/tabs/*`
// in this app's eslint config until Phase C consumes it.
export function DetectorTab(_props: Readonly<DetectorTabProps>): JSX.Element {
  return (
    <div className="card tool">
      <div className="stub-todo">
        {/* TODO(phase-c): detector paste area + on-device verdict via
            @movar/lang-detect.detectCyrillicLanguage. */}
        <strong>Detector</strong>
        <span>
          TODO — Phase C implements this tab in <code>src/tabs/DetectorTab.tsx</code>
        </span>
      </div>
    </div>
  );
}
