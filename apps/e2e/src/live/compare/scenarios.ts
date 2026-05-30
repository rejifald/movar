/**
 * Compare-suite scenarios — the curated query / keyword-pair list.
 *
 * Each scenario is one Google search. Two legs run in parallel inside the
 * runner: a baseline leg (no Movar, plain Chromium) and a treatment leg
 * (Movar loaded). Both must assert successfully or the scenario fails.
 *
 *   - Baseline must contain ≥ `minRussianLeaks` Russian-only word forms
 *     in the results region (proving the bug is real in this env).
 *   - Treatment must contain 0 Russian-only word forms AND ≥
 *     `minUkrainianMarkers` Ukrainian word forms (proving Movar fixed
 *     the same query on the same day).
 *
 * The keyword lists are curated by domain knowledge, not generated. For
 * every query the principle is the same: pick word forms that *cannot*
 * appear in the other language. "напряжения" (Russian genitive of
 * voltage) shares zero surface form with the Ukrainian "напруги" — a
 * single hit is decisive.
 *
 * Inflections: Russian is heavily inflected; product snippets and news
 * leads commonly use nominative, genitive, and dative cases. We list
 * all three for the leak forms. Ukrainian markers we list nominative +
 * the most common case the query implies (genitive after "реле" /
 * "новини"; nominative for noun-as-keyword scenarios).
 *
 * Why these five: each one exercises a different surface kind —
 *
 *   - voltage-relay        electrical product (e-com)
 *   - news                 news vertical / informational
 *   - workshop-equipment   long-tail product (less head-traffic)
 *   - truck-buy            commercial intent / classifieds
 *   - black-friday         seasonal / mixed informational + commercial
 *
 * If Movar regresses on one query family but not another, this spread
 * surfaces it. If we needed only one we'd ship `voltage-relay` (it
 * mirrors the real-world Movar bug report).
 *
 * Thresholds are intentionally conservative for the first run. Pass 2
 * tunes them by `test:compare:headed` calibration against current
 * Google SERP shapes; raising `minRussianLeaks` makes the bug
 * reproduction stricter, raising `minUkrainianMarkers` makes the fix
 * stricter. Both should land at "comfortably above what we see today,
 * with room for Google to mix in some English/UA without breaking the
 * test".
 */

export interface CompareScenario {
  /** Stable kebab-case identifier; appears in test names and evidence
   *  attachment filenames. */
  id: string;
  /** Human label shown in the Playwright report. */
  label: string;
  /** What the user types. The runner encodes this into
   *  `https://www.google.com/search?q=<encoded>`; no `hl`, no `lr` —
   *  Movar must apply those itself. */
  query: string;
  /** HTTP headers added to both legs (identical across legs — that's
   *  the point of the comparison). Primes Google's locale-guessing
   *  toward Russian, which is the same environment a Russian-speaking
   *  user in (e.g.) Belarus, Kazakhstan, or with a Russian-language
   *  Chrome would present. */
  extraHeaders?: Record<string, string>;
  /** Surface forms that ONLY appear in Russian results. A single hit
   *  inside the results region's joined text counts. */
  russianLeakKeywords: readonly string[];
  /** Surface forms that mark Ukrainian results. Used to assert the
   *  treatment leg actually returned Ukrainian content (not English,
   *  not a 503 page). */
  ukrainianMarkers: readonly string[];
  baseline: {
    /** Hard floor — fewer than this many leak hits in baseline = bug
     *  not reproduced = test fails. Honest signal that Google's
     *  locale-guessing changed, the egress IP is wrong, or the query
     *  shifted in popularity. */
    minRussianLeaks: number;
  };
  treatment: {
    /** Hard ceiling — more than this many leak hits in treatment =
     *  Movar didn't fully cleanse the SERP. 0 is the right value;
     *  parameterising it leaves room for a known-Google-bug carve-out
     *  if one ever comes up. */
    maxRussianLeaks: number;
    /** Hard floor for treatment — Ukrainian markers present in
     *  results. Below this = SERP isn't Ukrainian even if leak-free
     *  (could be all-English, empty, error page). */
    minUkrainianMarkers: number;
    /** Optional structural assertions on the post-Movar URL. The
     *  default Google rule rewrites `/search?q=` to add `hl=uk&lr=lang_uk`. */
    urlContains?: RegExp;
    /** Expected prefix of `<html lang>` after Movar settles. `'uk'`
     *  matches `uk`, `uk-UA`, etc. */
    htmlLang?: string;
  };
  /** Env-var escape hatch. Setting it to `'1'` skips this scenario —
   *  handy when a single query is wedged by a CAPTCHA on Google's
   *  side but the others still work. Per-scenario, not per-suite, so
   *  partial coverage stays possible. */
  skipIfEnv?: string;
}

/** Prime Google's locale-guessing toward Russian for the baseline. The
 *  bug we're witnessing is "Google's locale guess defaults to Russian
 *  for Cyrillic queries"; sending `Accept-Language: ru-RU` is one of
 *  the cleanest ways to put us in that bucket regardless of egress IP. */
const RU_ACCEPT_LANGUAGE = { 'Accept-Language': 'ru-RU,ru;q=0.9' } as const;

export const SCENARIOS: readonly CompareScenario[] = [
  {
    id: 'voltage-relay',
    label: 'google.com — реле напруги (voltage relay, e-com query)',
    query: 'реле напруги',
    extraHeaders: RU_ACCEPT_LANGUAGE,
    russianLeakKeywords: ['напряжения', 'напряжение', 'напряжению'],
    ukrainianMarkers: ['напруги', 'напруга', 'напрузі'],
    baseline: { minRussianLeaks: 2 },
    treatment: {
      maxRussianLeaks: 0,
      minUkrainianMarkers: 3,
      urlContains: /[?&]hl=uk\b/,
      htmlLang: 'uk',
    },
    skipIfEnv: 'SKIP_VOLTAGE_RELAY',
  },
  {
    id: 'news',
    label: 'google.com — новини україни сьогодні (news vertical)',
    query: 'новини україни сьогодні',
    extraHeaders: RU_ACCEPT_LANGUAGE,
    russianLeakKeywords: ['новости', 'сегодня', 'украины'],
    ukrainianMarkers: ['новини', 'сьогодні', 'україни'],
    baseline: { minRussianLeaks: 2 },
    treatment: {
      maxRussianLeaks: 0,
      minUkrainianMarkers: 3,
      urlContains: /[?&]hl=uk\b/,
      htmlLang: 'uk',
    },
    skipIfEnv: 'SKIP_NEWS',
  },
  {
    id: 'workshop-equipment',
    label: 'google.com — обладнання для майстерні (long-tail product)',
    query: 'обладнання для майстерні',
    extraHeaders: RU_ACCEPT_LANGUAGE,
    russianLeakKeywords: ['оборудование', 'оборудования', 'мастерской', 'мастерская'],
    ukrainianMarkers: ['обладнання', 'майстерні', 'майстерня'],
    baseline: { minRussianLeaks: 2 },
    treatment: {
      maxRussianLeaks: 0,
      minUkrainianMarkers: 3,
      urlContains: /[?&]hl=uk\b/,
      htmlLang: 'uk',
    },
    skipIfEnv: 'SKIP_WORKSHOP',
  },
  {
    id: 'truck-buy',
    label: 'google.com — вантажівка купити (commercial intent / classifieds)',
    query: 'вантажівка купити',
    extraHeaders: RU_ACCEPT_LANGUAGE,
    russianLeakKeywords: ['грузовик', 'грузовики', 'купить', 'продажа'],
    ukrainianMarkers: ['вантажівка', 'вантажівки', 'купити', 'продаж'],
    baseline: { minRussianLeaks: 2 },
    treatment: {
      maxRussianLeaks: 0,
      minUkrainianMarkers: 3,
      urlContains: /[?&]hl=uk\b/,
      htmlLang: 'uk',
    },
    skipIfEnv: 'SKIP_TRUCK',
  },
  {
    id: 'black-friday',
    label: "google.com — знижки чорна п'ятниця (seasonal, mixed intent)",
    query: "знижки чорна п'ятниця",
    extraHeaders: RU_ACCEPT_LANGUAGE,
    russianLeakKeywords: ['скидки', 'скидка', 'пятница', 'чёрная', 'черная'],
    ukrainianMarkers: ['знижки', 'знижка', "п'ятниця", 'чорна'],
    baseline: { minRussianLeaks: 2 },
    treatment: {
      maxRussianLeaks: 0,
      minUkrainianMarkers: 3,
      urlContains: /[?&]hl=uk\b/,
      htmlLang: 'uk',
    },
    skipIfEnv: 'SKIP_BLACK_FRIDAY',
  },
];
