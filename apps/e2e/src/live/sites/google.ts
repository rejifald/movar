/**
 * Google search — enforce-mode rule. A Cyrillic query like `яблуко`
 * (or worse, an ambiguous one like `картина`) routinely bleeds RU
 * results because Google falls back to the larger RU corpus.
 *
 * Movar's rule adds `hl=uk&lr=lang_uk` on every `/search` navigation
 * with a `q` param. The URL changes (params added) but the host stays
 * google.com — that's the verification target here.
 *
 * Anti-bot risk is real: Google sometimes serves a CAPTCHA to fresh
 * Playwright contexts. The test is opt-out via `SKIP_GOOGLE=1` so a
 * full suite run can still finish on a captcha day.
 */
import type { SiteFixture } from './types';

export const siteGoogle: SiteFixture = {
  id: 'google-com',
  label: 'google.com (enforce: hl + lr)',
  kind: 'search',
  startUrl: 'https://www.google.com/search?q=%D1%8F%D0%B1%D0%BB%D1%83%D0%BA%D0%BE',
  hostname: 'www.google.com',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    // SERP chrome is mostly empty of `ы`/`ё`; loose initial expectation.
    htmlLangPrefix: ['ru', 'en', 'uk', ''],
    bodyDetected: ['ru', 'uk', 'unknown'],
    minRuScore: 0,
  },
  afterMovar: {
    url: /[?&]hl=uk\b/,
    minHiddenLinks: 0, // Google SERP doesn't have a "language picker" Movar would filter
  },
  correction: {
    // pageLang at first land; 'uk' or '' possible when SERP body is too
    // short / ambiguous for body detection to reach 'ru'.
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['search'],
  },
  skipIfEnv: 'SKIP_GOOGLE',
};
