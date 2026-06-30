import type { LanguageCode } from '@movar/lang-detect';
import type { ResolvedLocale } from './resolve';

/**
 * Build a language-code → display-name resolver bound to a popup locale.
 *
 *   makeLanguageDisplay('uk')('en')  // → 'англійська'
 *   makeLanguageDisplay('en')('uk')  // → 'Ukrainian'
 *
 * Wraps `Intl.DisplayNames` with two guarantees the call sites rely on:
 *
 *   - The `try` swallow falls back to the bare ISO code if the runtime
 *     doesn't ship the API (very old WebViews) or the code isn't in CLDR.
 *     Returning the code is wrong-looking but safe — never crashes the
 *     popup, never blanks a UI label.
 *   - The DisplayNames instance is constructed once per call to this factory
 *     and captured in the returned closure, so callers can cheaply produce
 *     N labels without N constructions. Pass the closure around when
 *     rendering chip chains or other repeated lookups.
 *
 * Shared between {@link StatusHeader}'s priority chips and
 * {@link HiddenPanel}'s hidden-language list — the two had identical
 * 8-line copies before this lifting.
 */
export function makeLanguageDisplay(locale: ResolvedLocale): (code: LanguageCode) => string {
  let names: Intl.DisplayNames | null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'language' });
  } catch {
    names = null;
  }
  return (code) => names?.of(code) ?? code;
}
