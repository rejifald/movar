/**
 * Settings mutation, kept in TypeScript so no shell reimplements it.
 *
 * The transport is already native and does not change: a shared platform store
 * (the App Group on Apple, `settings` + a monotonic `settingsRev`) that the
 * extension's background worker reconciles with `browser.storage.sync`, highest
 * `rev` winning. Moving the UI to SwiftUI/Compose/WinUI actually removes a hop.
 *
 * The risk is not the transport, it is the invariants. `@movar/settings` owns
 * the schema, `migrateSettings`, and — critically — `enforceLockedLanguages`,
 * which recomputes `blocked` from `priority` and re-asserts that Russian stays
 * blocked. Today the React tab writes *through* that code, so those hold by
 * construction. A native form that built settings JSON directly would hold them
 * only while a hand-written Swift/Kotlin/C# copy stayed in step, and drift there
 * means either a state the extension rejects or a locked language quietly
 * unblocked.
 *
 * So native emits **intents** and never constructs settings. The shell owns
 * layout and controls; this file owns what a change means. See
 * `docs/native-shells.md`.
 */
import { enforceLockedLanguages, normalizeAllowlist, normaliseDomain } from '@movar/settings';
import type { ConcealMode, MovarSettings } from '@movar/settings';
import { migrateSettings } from '@movar/settings/migrate';
import type { LanguageCode } from '@movar/lang-detect';

/**
 * What a native control can ask for.
 *
 * Deliberately narrower than `MovarSettings`. There is no `blocked` intent:
 * `blocked` is derived from `priority` by `deriveBlocked`, and offering to set
 * it would re-open exactly the footgun `enforceLockedLanguages` closes. There is
 * no `schemaVersion` intent either — it is a managed marker the UI must never
 * expose.
 *
 * `uiLanguage` is absent because the app's locale follows the device on every
 * platform; the host app has never shipped a UI-language picker.
 */
export type SettingsIntent =
  | { readonly kind: 'enabled.set'; readonly value: boolean }
  | { readonly kind: 'priority.set'; readonly value: readonly LanguageCode[] }
  | { readonly kind: 'contentModification.set'; readonly value: boolean }
  | { readonly kind: 'concealMode.set'; readonly value: ConcealMode }
  | { readonly kind: 'allowlist.add'; readonly domain: string }
  | { readonly kind: 'allowlist.remove'; readonly domain: string };

/**
 * Adopt whatever the platform store held.
 *
 * The blob may have roamed in from another device running an older or newer
 * build, so it is migrated rather than trusted, then invariant-checked. A store
 * that held nothing yields the defaults.
 */
export function loadSettings(raw: unknown): MovarSettings {
  return enforceLockedLanguages(migrateSettings(raw));
}

/**
 * Apply one intent and return the settings the host should persist.
 *
 * `enforceLockedLanguages` runs last on every path, so `blocked` is recomputed
 * and the locked set re-asserted no matter which control fired. Returning a new
 * object (rather than mutating) keeps this safe to call from a native thread
 * that may still be holding the previous state.
 */
export function applyIntent(current: MovarSettings, intent: SettingsIntent): MovarSettings {
  return enforceLockedLanguages(next(current, intent));
}

function next(current: MovarSettings, intent: SettingsIntent): MovarSettings {
  switch (intent.kind) {
    case 'enabled.set': {
      return { ...current, enabled: intent.value };
    }
    case 'priority.set': {
      return { ...current, priority: [...intent.value] };
    }
    case 'contentModification.set': {
      return { ...current, contentModification: intent.value };
    }
    case 'concealMode.set': {
      return { ...current, concealMode: intent.value };
    }
    case 'allowlist.add': {
      // Normalised here rather than in the shell so three native text fields
      // cannot disagree about what "the same domain" means.
      return {
        ...current,
        allowlist: normalizeAllowlist([...current.allowlist, intent.domain]),
      };
    }
    case 'allowlist.remove': {
      const target = normaliseDomain(intent.domain);
      return {
        ...current,
        allowlist: current.allowlist.filter((entry) => normaliseDomain(entry) !== target),
      };
    }
  }
}
