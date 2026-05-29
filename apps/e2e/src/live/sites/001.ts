/**
 * 001.com.ua — Ukrainian electronics catalogue. No site rule; relies on
 * the generic hreflang strategy + picker heuristic.
 *
 * RU start: `/delux` (the bare RU path) with `Accept-Language: ru`. The
 * canonical hreflang says `ru → /delux`, `uk → /uk/delux`.
 *
 * Switch path: Movar reads `<link rel="alternate" hreflang="uk">` and
 * navigates to `/uk/delux`.
 *
 * Picker filter: the "UA | RU" bare-text picker (recently classified
 * by 2c9b96e). Both items live in `<li class="switch-lang">`; after
 * Movar runs with blocked=['ru'] the RU anchor gets `display:none`
 * and the surviving "UA" span has its trailing `|` trimmed.
 */
import type { SiteFixture } from './types';

export const site001: SiteFixture = {
  id: '001-com-ua',
  label: '001.com.ua (Delux catalogue)',
  kind: 'site',
  startUrl: 'https://001.com.ua/delux',
  hostname: '001.com.ua',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    htmlLangPrefix: ['ru', 'uk'], // site sometimes serves uk even on /delux; we tolerate
    bodyDetected: ['ru', 'uk'],
  },
  afterMovar: {
    url: /^https:\/\/001\.com\.ua\/uk\/delux/,
    htmlLangPrefix: ['uk'],
    bodyDetected: 'uk',
    minHiddenLinks: 1,
    hiddenSelectors: ['li.switch-lang a[href*="lang=ru"]'],
    visibleSelectors: ['li.switch-lang'],
  },
  correction: {
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['redirect'], // generic hreflang fallback
  },
  notes:
    '001 sometimes geolocates Ukraine visitors to UA regardless of Accept-Language — when that happens, the initial assertion will fail honestly and the redirect test is skipped because pageLang was already uk.',
};
