/**
 * YouTube search — enforce-mode (`hl + gl`) AND content-filter (DOM
 * blur on RU-language video titles).
 *
 * The enforce rule rewrites the URL with `hl=uk&gl=UA`. The
 * content-filter then scans `ytd-video-renderer` and siblings, runs
 * each card's title text through `@movar/lang-detect`, and overlays a
 * curtain on cards classified as RU.
 *
 * Both behaviors verified in one fixture: URL params + curtain count.
 */
import type { SiteFixture } from './types';

export const siteYouTube: SiteFixture = {
  id: 'youtube-com',
  label: 'youtube.com (enforce: hl + gl, content-filter blur)',
  kind: 'search',
  // `собака` is an ambiguous Cyrillic word (UA + RU) that surfaces a
  // healthy mix on the SERP. Without Movar most results are RU; with
  // Movar's hl+gl and content-filter, blur cards should appear.
  startUrl: 'https://www.youtube.com/results?search_query=%D1%81%D0%BE%D0%B1%D0%B0%D0%BA%D0%B0',
  hostname: 'www.youtube.com',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  initial: {
    htmlLangPrefix: ['ru', 'en', ''],
    bodyDetected: ['ru', 'unknown'],
  },
  afterMovar: {
    url: /[?&]hl=uk\b/,
    minHiddenLinks: 0,
    // At least one RU video card should be blurred. Loose threshold —
    // YouTube's ranking shifts daily; tightening this would flake.
    minContentBlur: 1,
  },
  correction: {
    // pageLang at first land; 'uk' or '' possible when SERP body is too
    // short / ambiguous for body detection to reach 'ru'.
    fromLang: 'ru',
    toLang: 'uk',
    // Union semantics: YouTube fires TWO distinct CorrectionEvents —
    // one with mechanism='search' (URL rewrite: hl=uk&gl=UA) and one
    // with mechanism='dom' (content-filter blur of RU video cards).
    // `expectCorrectionEvent` in sites.spec.ts uses `mechanism.includes(e.mechanism)`,
    // which means a SINGLE polled check passes when EITHER event lands.
    // If you need to assert both independently, call `expectCorrectionEvent`
    // twice with `mechanism: ['search']` and `mechanism: ['dom']` respectively.
    mechanism: ['search', 'dom'],
  },
  skipIfEnv: 'SKIP_YOUTUBE',
};
