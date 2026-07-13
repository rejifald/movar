/**
 * Deterministic `PageDiagnostics` fixture for the e2e visual harness.
 *
 * The real content script builds its snapshot by running the product models over
 * a live DOM, so its output drifts with the page. This fixture instead hand-pins
 * one representative snapshot that populates ALL FOUR panel tabs and exercises
 * every visual branch the design tokens touch, so a token regression on any of
 * them lands as a pixel diff:
 *
 *   - Content: a blocked card (danger badge + danger-deep language), a kept
 *     card, a franc-AGREE mark (accent check), a franc-DISAGREE mark (danger
 *     triangle + code), and an `unknown` card (no verdict / no franc);
 *   - Pickers: an active+blocked option (danger chip) alongside kept options;
 *   - Page mode: the dark verdict + a signal chain with a fired and unfired row;
 *   - Page lang: a blocked verdict + its signal chain.
 *
 * English-only, matching the dev extension (see `language-name.ts`).
 */
import type { LanguageCode } from '@movar/lang-detect';
import type { PageDiagnostics } from '../src/types';

/** `unknown` is a legal `DiagCard.language` (see `types.ts`) but sits outside the
 *  `LanguageCode` union; the panel special-cases it. Cast once here. */
const UNKNOWN = 'unknown' as LanguageCode;

export const FIXTURE: PageDiagnostics = {
  extractor: 'youtube',
  cards: [
    {
      id: 'c1',
      kind: 'video',
      language: 'ru',
      rung: 1,
      margin: 0.42,
      blocked: true,
      francAgree: true,
      francLanguage: 'ru',
      sample: 'Новости сегодня: главные события дня в прямом эфире и последние сводки',
    },
    {
      id: 'c2',
      kind: 'result',
      language: 'uk',
      rung: '2a',
      margin: 0.31,
      blocked: false,
      francAgree: true,
      francLanguage: 'uk',
      sample: 'Українські новини та аналітика — головне за день коротко і по суті',
    },
    {
      id: 'c3',
      kind: 'channel',
      language: 'en',
      rung: '2b',
      margin: 0.55,
      blocked: false,
      francAgree: null,
      francLanguage: null,
      sample: 'Breaking news and analysis from around the world, updated hourly',
    },
    {
      id: 'c4',
      kind: 'video',
      language: 'uk',
      rung: 1,
      margin: 0.12,
      blocked: false,
      francAgree: false,
      francLanguage: 'ru',
      sample: 'Огляд подій: що сталося цього тижня у світі та вдома',
    },
    {
      id: 'c5',
      kind: 'result',
      language: UNKNOWN,
      rung: null,
      margin: 0,
      blocked: false,
      francAgree: null,
      francLanguage: null,
      sample: '2026 — mixed 语言 · 12:34 · ??? untranslatable snippet',
    },
  ],
  cardLangCounts: { ru: 1, uk: 2, en: 1, unknown: 1 },
  pickers: [
    {
      id: 'p1',
      activeLanguage: 'ru',
      languages: [
        { id: 'p1-ru', code: 'ru', blocked: true, active: true },
        { id: 'p1-uk', code: 'uk', blocked: false, active: false },
        { id: 'p1-en', code: 'en', blocked: false, active: false },
        { id: 'p1-de', code: 'de', blocked: false, active: false },
      ],
    },
  ],
  pageMode: {
    verdict: 'dark',
    decidedBy: 'prefers-color-scheme',
    signals: [
      { label: 'prefers-color-scheme', value: 'dark' },
      { label: 'meta color-scheme', value: null },
      { label: 'html[data-theme]', value: null },
      { label: 'computed background', value: '#141211' },
    ],
  },
  pageLanguage: {
    verdict: 'ru',
    blocked: true,
    signals: [
      { label: 'html[lang]', value: 'ru' },
      { label: 'self hreflang', value: null },
      { label: 'path segment', value: null },
      { label: 'subdomain', value: null },
    ],
  },
  // One blocked card (c1) + one blocked picker option (p1-ru).
  blockedCount: 2,
};
