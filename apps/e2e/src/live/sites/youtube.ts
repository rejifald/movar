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
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['search', 'dom'],
  },
  skipIfEnv: 'SKIP_YOUTUBE',
  notes:
    'YouTube polymer router strips unknown params during routing; the loop guard in content.ts keeps us from bouncing. Content-filter blur threshold is intentionally loose (≥1) to absorb daily ranking shifts.',
};
