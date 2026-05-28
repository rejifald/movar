/**
 * DuckDuckGo search — enforce-mode rule writes `kl=ua-uk`. DDG serves
 * SERPs at the root (`/?q=…`), so the rule has no path gate.
 *
 * DDG is the most automation-friendly of the four search engines; in
 * practice this test is the closest thing to a reliable green.
 */
import type { SiteFixture } from './types';

export const siteDuckDuckGo: SiteFixture = {
  id: 'duckduckgo-com',
  label: 'duckduckgo.com (enforce: kl)',
  kind: 'search',
  startUrl: 'https://duckduckgo.com/?q=%D1%8F%D0%B1%D0%BB%D1%83%D0%BA%D0%BE',
  hostname: 'duckduckgo.com',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    htmlLangPrefix: ['en', 'ru', 'uk', ''],
    bodyDetected: ['ru', 'uk', 'unknown'],
  },
  afterMovar: {
    url: /[?&]kl=ua-uk\b/,
    minHiddenLinks: 0,
  },
  correction: {
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['search'],
  },
};
