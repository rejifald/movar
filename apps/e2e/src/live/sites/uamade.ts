/**
 * uamade.ua — Ukrainian crafts marketplace (CS-Cart). No site rule;
 * `hreflang` fallback does the work. RU canonical: `/`. UA: `/uk/`.
 *
 * Picker filter: CS-Cart `ty-select` dropdown. The trigger anchor is
 * outside the dropdown `<ul>` and has no `href`, so Movar's picker
 * discovery sees the inner `<ul>` (RU + EN) as a bilingual picker; the
 * UA "trigger" stays as-is. With blocked=['ru'] the RU `<li>` is hidden
 * and the EN `<li>` survives.
 */
import type { SiteFixture } from './types';

export const siteUamade: SiteFixture = {
  id: 'uamade-ua',
  label: 'uamade.ua (CS-Cart ty-select)',
  kind: 'site',
  startUrl: 'https://uamade.ua/',
  hostname: 'uamade.ua',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    htmlLangPrefix: ['ru', 'uk'],
    bodyDetected: ['ru', 'uk'],
  },
  afterMovar: {
    url: /^https:\/\/uamade\.ua\/uk\//,
    htmlLangPrefix: ['uk'],
    bodyDetected: 'uk',
    minHiddenLinks: 1,
    hiddenSelectors: ['#languages_41 a[href="https://uamade.ua/"]'],
    visibleSelectors: ['#languages_41 a[href="https://uamade.ua/en/"]'],
  },
  correction: {
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['redirect'], // hreflang fallback
  },
};
