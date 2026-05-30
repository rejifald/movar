/**
 * Bing search — enforce-mode `setlang` rule. Less anti-bot risk than
 * Google; usually the most reliable search test in the suite.
 */
import type { SiteFixture } from './types';

export const siteBing: SiteFixture = {
  id: 'bing-com',
  label: 'bing.com (enforce: setlang)',
  kind: 'search',
  startUrl: 'https://www.bing.com/search?q=%D1%8F%D0%B1%D0%BB%D1%83%D0%BA%D0%BE',
  hostname: 'www.bing.com',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    htmlLangPrefix: ['ru', 'en', 'uk', ''],
    bodyDetected: ['ru', 'uk', 'unknown'],
  },
  afterMovar: {
    url: /[?&]setlang=uk\b/,
    minHiddenLinks: 0,
  },
  correction: {
    // pageLang at first land; 'uk' or '' possible when SERP body is too
    // short / ambiguous for body detection to reach 'ru'.
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['search'],
  },
};
