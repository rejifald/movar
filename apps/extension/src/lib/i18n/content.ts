/**
 * Module-level i18n for the content script, where injected DOM curtains (picker
 * container, blur cards) can't read React context. The bootstrap in
 * entrypoints/content.ts calls {@link setContentLocale} once with the resolved
 * locale; the content-modification facade calls {@link loadContentMessages} before
 * its first conceal pass; curtain factories call {@link getContentMessages} when
 * they build pills.
 *
 * To keep inactive locales out of the always-on bundle, only English ships in the
 * content script (the default, and the fallback). A non-English active locale is
 * fetched once from the background worker — which hosts every catalogue — and
 * cached for the synchronous {@link getContentMessages} reads the curtain factories
 * need. If the worker can't be reached the English fallback stays.
 *
 * Locale changes after bootstrap don't retroactively re-render existing curtains —
 * the strings are baked in when the pill is built. The popup setting is read at
 * content-script init only.
 */

import { browser } from 'wxt/browser';
import type { ResolvedLocale } from '@movar/i18n/resolve';
import { adaptContentStrings } from './content-strings';
import type { ContentMessages, ContentStrings } from './content-strings';
import { contentStringsEn } from './content-strings-en';
import type { ContentStringsMessage } from '../messaging';

let currentLocale: ResolvedLocale = 'en';
/** English is bundled as the fallback; a non-English locale replaces this once
 *  fetched from the worker. */
const FALLBACK: ContentMessages = adaptContentStrings(contentStringsEn);
let currentMessages: ContentMessages = FALLBACK;
let loaded = false;

export function setContentLocale(locale: ResolvedLocale): void {
  currentLocale = locale;
  // A changed locale invalidates the cache: drop back to the English fallback
  // until loadContentMessages (re)fetches. English itself needs no fetch.
  currentMessages = FALLBACK;
  loaded = false;
}

/**
 * Fetch the active locale's curtain strings from the background worker and cache
 * them for the synchronous {@link getContentMessages} reads the curtain factories
 * need. A no-op for English (the bundled fallback) and after a successful load; on
 * a failed/unreachable fetch the English fallback stays and the next call retries.
 * Idempotent — safe to await on every content-modification tick.
 */
export async function loadContentMessages(): Promise<void> {
  if (loaded || currentLocale === 'en') {
    loaded = true;
    return;
  }
  const message: ContentStringsMessage = { type: 'movar:contentStrings', locale: currentLocale };
  try {
    const raw: unknown = await browser.runtime.sendMessage(message);
    if (raw != null) {
      currentMessages = adaptContentStrings(raw as ContentStrings);
      loaded = true;
    }
  } catch {
    // Worker not ready / unreachable — keep the English fallback; retry next tick.
  }
}

export function getContentMessages(): ContentMessages {
  return currentMessages;
}
