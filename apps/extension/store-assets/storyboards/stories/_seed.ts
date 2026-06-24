/**
 * Shared deterministic state-seeding for the popup screenshot stories.
 *
 * Centralises the `MovarSettings` seed so the marketplace `PopupOnNews` and
 * marketing `Popup` scenes render identical Ukrainian-locale chrome. Keeping
 * it in one file makes drift between what the popup expects and what we hand
 * it greppable from a single place.
 *
 * (The popup no longer surfaces a cross-site "corrections today" count, so the
 * old synthetic-events seed is gone — scenes now seed an active-tab snapshot
 * via `parameters.browserMock.activeTab` instead.)
 */
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

/**
 * Settings the Ukrainian-locale stories seed into `storage.sync`. Mirrors
 * the defaults from `@movar/settings` with `uiLanguage: 'uk'` so the popup
 * renders in Ukrainian without going through the `'auto'` resolution path
 * (which would otherwise call `browser.i18n.getUILanguage()` — handled by
 * the mock too, but pinning explicitly here makes the story self-
 * documenting). `contentModification: true` so the hidden panel renders.
 */
export const ukSettings: MovarSettings = {
  ...defaultSettings,
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: true,
  concealMode: 'curtain',
  uiLanguage: 'uk',
};

/**
 * English-locale sibling of {@link ukSettings} for the EN screenshot scenes.
 *
 * Critical: the popup resolves its chrome language from `priority` (via
 * `uiLanguageFromPriority` — the first supported language wins), **not** from
 * the legacy `uiLanguage` field (see `src/entrypoints/popup/App.tsx` and the
 * footer note about the retired UI-language picker). So an EN scene must put
 * `'en'` first in `priority`; spreading `ukSettings` and only flipping
 * `uiLanguage: 'en'` would leave `priority: ['uk', 'en']` in place and render
 * the popup chrome in Ukrainian. `uiLanguage: 'en'` is kept consistent for any
 * non-popup surface that still reads it, but `priority` is what the popup obeys.
 */
export const enSettings: MovarSettings = {
  ...ukSettings,
  priority: ['en', 'uk'],
  uiLanguage: 'en',
};
