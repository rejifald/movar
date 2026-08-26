/*
 * Every published figure «Мову рахують» stands on, in one place.
 *
 * The post's whole claim is that the reader need not take our word for
 * anything, which only holds while the charts, the prose and the research doc
 * agree. Before this module each number lived in three copies — the chart
 * component, the article markdown, and `docs/articles/movu-rakhuyut.research.md`
 * — and they had already drifted twice during drafting: the article printed
 * Wikipedia's 2024 share to two decimals while the chart rounded to one, and
 * the Steam section called a tail "flat" that its own chart shows climbing.
 *
 * So: the charts import their series from here, `article-figures.test.ts`
 * asserts that everything marked `quoted` still appears verbatim in the
 * markdown, and `capture-article-assets.mts` stamps the data it rendered so a
 * figure cannot change without the PNGs being re-captured.
 *
 * **Derived numbers are computed, never stored.** The ratios the prose quotes
 * — Russian is 13× Ukrainian on Steam, 4,3× on Wikipedia in 2013, 5,7× on the
 * open web — are quotients of figures already here. Storing them would create
 * exactly the drift this module exists to stop: update the numerator, forget
 * the ratio, ship a sentence the chart beside it disproves. `ratio()` and
 * `growth()` below are the only way the article is allowed to state one.
 *
 * Adding a figure: give it a source a reader can open and the date it was
 * read. A number without a date is not evidence.
 */

/** Ukrainian decimal comma, used by both the charts and the prose check. */
export function formatShare(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

/** Narrow no-break space as the thousands separator, matching the prose. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US').replace(/,/g, ' ');
}

/**
 * How many times bigger `a` is than `b`, with the Ukrainian noun that agrees
 * with it: a decimal quantity always takes «раза», so keeping at least one
 * decimal keeps the grammar derivable instead of hand-written. Rounding
 * 13,29 up to a bare «13» would need «разів» and a second code path.
 *
 * The «у»/«в» alternation stays in the prose — it depends on the preceding
 * word, not on the number.
 */
export function ratio(a: number, b: number, digits = 1): string {
  return `${(a / b).toFixed(digits).replace('.', ',')} раза`;
}

/** Percentage-point change between two shares, e.g. «0,06». */
export function delta(from: number, to: number, digits = 2): string {
  return Math.abs(to - from)
    .toFixed(digits)
    .replace('.', ',');
}

interface Provenance {
  /** A URL the reader can open. */
  source: string;
  /** ISO date the source was read. */
  asOf: string;
}

/**
 * The day every source below was last opened and checked.
 *
 * One constant rather than six copies: they were all read in one sitting, and
 * a per-dataset date that nobody remembers to move is worse than no date. When
 * a single figure is refreshed on its own, split its dataset off with its own
 * `asOf` rather than editing this — a shared date that is only true of five of
 * six sources is a lie the schema cannot catch.
 */
const READ_ON = '2026-08-26';

/* ------------------------------------------------------------------ Steam */

interface SteamReading {
  /** Months elapsed since January 2022 — the chart's real-time axis. */
  month: number;
  share: number;
  label: string;
  /** True when the article prints this reading in prose. */
  quoted: boolean;
}

export interface SurveyLanguage {
  name: string;
  /** Percent share in the July 2026 survey, as published. */
  share: number;
  emphasis?: 'ua' | 'ru';
  note?: string;
}

/**
 * The July 2026 survey's full language table.
 *
 * Shared by two scenes in two different articles: the ranking bars in «Тиха
 * капітуляція» and the trend line in «Мову рахують», whose last point is the
 * same published number as this table's Ukrainian row. They used to be
 * separate copies of the same survey — `article-figures.test.ts` now pins them
 * to each other, so refreshing the survey cannot leave one article a month
 * behind the other.
 */
const SURVEY_LANGUAGES = [
  { name: 'Англійська', share: 39.61 },
  { name: 'Китайська (спрощена)', share: 22.52 },
  { name: 'Російська', share: 9.3, emphasis: 'ru' },
  { name: 'Іспанська (Іспанія)', share: 4.91 },
  { name: 'Португальська (Бразилія)', share: 4.38 },
  { name: 'Німецька', share: 2.82 },
  { name: 'Японська', share: 2.43 },
  { name: 'Французька', share: 2.33 },
  { name: 'Польська', share: 1.74 },
  { name: 'Корейська', share: 1.45 },
  { name: 'Китайська (традиційна)', share: 1.33 },
  { name: 'Турецька', share: 1.24 },
  { name: 'Іспанська (Лат. Америка)', share: 0.89 },
  { name: 'Тайська', share: 0.85 },
  {
    name: 'Українська',
    share: 0.7,
    emphasis: 'ua',
    note: '15-те місце — вже попереду італійської',
  },
  { name: 'Італійська', share: 0.63 },
] as const satisfies readonly SurveyLanguage[];

export const steamSurvey = {
  ...({
    source: 'https://store.steampowered.com/hwsurvey',
    asOf: READ_ON,
  } satisfies Provenance),
  month: 'липень 2026',
  /*
   * Widened for iteration: `as const` gives each row its own literal type, and
   * rows that omit `emphasis` then genuinely lack the property, so consumers
   * cannot read it off the union. The narrow tuple stays internal, where the
   * anchors below index into it safely.
   */
  languages: SURVEY_LANGUAGES as readonly SurveyLanguage[],
} as const;

/** The two rows the trend scene and the prose both lean on. Indices into the
 *  narrow tuple, pinned to their names by `article-figures.test.ts`. */
export const surveyUkrainian = SURVEY_LANGUAGES[14];
export const surveyRussian = SURVEY_LANGUAGES[2];

export const steam = {
  ...({
    source: 'https://store.steampowered.com/hwsurvey',
    asOf: READ_ON,
  } satisfies Provenance),
  /** Share of Steam users running the client in Ukrainian. */
  readings: [
    { month: 0, share: 0.17, label: 'початок 2022', quoted: true },
    { month: 9, share: 0.34, label: 'жовтень 2022', quoted: false },
    { month: 14, share: 0.5, label: 'березень 2023', quoted: false },
    { month: 19, share: 0.64, label: 'серпень 2023', quoted: true },
    { month: 40, share: 0.73, label: 'травень 2025', quoted: false },
    { month: 54, share: surveyUkrainian.share, label: 'липень 2026', quoted: true },
  ] as const satisfies readonly SteamReading[],
  /** Same survey month, for the comparison the section closes on. */
  russianShare: surveyRussian.share,
} as const;

/*
 * Named positions in the series. The readings are a fixed tuple, so these are
 * ordinary safe lookups rather than assertions — and a call site that says
 * `steamClimbEnd` instead of `readings[3]` cannot silently point at the wrong
 * row when a reading is inserted.
 */
const steamFirst = steam.readings[0];
/** Where the steep climb stops — August 2023. */
export const steamClimbEnd = steam.readings[3];
export const steamLatest = steam.readings[5];

/** The climb the section calls «вчетверо». */
export const steamClimb = { from: steamFirst.share, to: steamClimbEnd.share };
/** The stall after it — quoted as a size, never characterised as "flat". */
export const steamStall = { from: steamClimbEnd.share, to: steamLatest.share };

/* -------------------------------------------------------------- Cyberpunk */

export interface CyberpunkBar {
  label: string;
  /** Percent share exactly as published. Never derived, never summed. */
  share: number;
  /** Which side of the comparison the bar carries, for the emphasis palette. */
  emphasis?: 'ua' | 'ru';
}

export const cyberpunk = {
  ...({
    source: 'https://gamedev.dou.ua/forums/topic/47022/',
    asOf: READ_ON,
  } satisfies Provenance),
  /*
   * Shares exactly as published. They are NOT summed anywhere: the "after"
   * three total 96%, because the source names three and does not account for
   * the remainder. That is why the chart groups rather than stacks.
   */
  before: [
    { label: 'Російська', share: 88, emphasis: 'ru' },
    { label: 'Повністю англійська', share: 7 },
    // `\n` is an explicit line break: the scenes are SVG, which does not wrap text.
    { label: 'Російські субтитри,\nанглійська озвучка', share: 5 },
  ] as const satisfies readonly CyberpunkBar[],
  after: [
    { label: 'Українська', share: 42, emphasis: 'ua' },
    { label: 'Російська — субтитри або озвучка', share: 47, emphasis: 'ru' },
    { label: 'Повністю англійська', share: 7 },
  ] as const satisfies readonly CyberpunkBar[],
  releasedOn: '21 вересня 2023 року',
} as const;

/**
 * The Witcher 3's Ukrainian localisation — announced, not yet shipped.
 *
 * Kept here rather than loose in the prose because it carries the same
 * obligation as any figure: a source a reader can open, and a date. It is the
 * one entry with no measurement attached, and deliberately so — the remaster
 * is a month away at the time of writing, so there is nothing to count yet.
 * That absence is the point the article makes with it.
 *
 * Second-hand: two Ukrainian specialist outlets reporting the same Gamescom
 * Opening Night Live announcement. CD Projekt RED's own storefront entry could
 * not be used to confirm it — the Steam page serves an age gate whose language
 * menu is Steam's *interface* list, which is the very thing this article is
 * about and not the game's localisation table.
 */
export const witcher = {
  ...({
    source: 'https://dev.ua/news/onovlenyi-vidmak-z-ukrainskoiu-1787719716',
    asOf: READ_ON,
  } satisfies Provenance),
  announcedAt: 'Gamescom, серпень 2026',
  /** Free remaster for existing owners. */
  releasesOn: '29 вересня 2026',
  /** Text only — there is no Ukrainian voice acting. */
  textOnly: true,
} as const;

/**
 * Mewgenics — a poll losing to a counter, in public.
 *
 * The clearest case in the post of the distinction it is actually about: the
 * developer ran a vote, Ukrainian won it, and the localisation went elsewhere
 * because a *different* number said otherwise — one the platform keeps. He
 * published that number to explain the choice, which is what makes this
 * citable rather than inferred.
 *
 * The prose stays mechanical about it. This is not an entry about a studio
 * behaving badly; it is about which of two signals a decision can actually
 * read.
 */
export const mewgenics = {
  ...({
    source: 'https://gamedev.dou.ua/forums/topic/59828/',
    asOf: READ_ON,
  } satisfies Provenance),
  pollDate: 'травень 2024',
  /** Ukrainian's share of the localisation poll — first of four options. */
  ukrainianVoteShare: 63.3,
  totalVotes: 24_385,
  /** Where the Steam wishlist counts put things instead: Russia second, after
   *  the USA, with Ukraine outside the top eight. */
  russianWishlistRank: 2,
  ukrainianWishlistTopEight: false,
} as const;

/* -------------------------------------------------------------- Wikipedia */

export interface WikipediaRow {
  period: string;
  note: string;
  uk: number;
  ru: number;
  en: number;
}

export const wikipedia = {
  ...({
    source: 'https://uk.wikipedia.org/wiki/Українська_Вікіпедія',
    asOf: READ_ON,
  } satisfies Provenance),
  /*
   * Share of pageviews originating in Ukraine. Printed to ONE decimal
   * everywhere: the sources give 39,185% and 45,03%, and carrying two decimals
   * on one row while the others carry one implies precision the series has not
   * got.
   */
  rows: [
    { period: '2013', note: 'за рік', uk: 16.4, ru: 71.1, en: 8.1 },
    { period: '2024', note: 'за рік', uk: 39.2, ru: 45, en: 10.5 },
    { period: 'вересень 2025', note: 'за місяць', uk: 33.6, ru: 45.7, en: 12.9 },
  ] as const satisfies readonly WikipediaRow[],
  /** Body-of-content figures, from meta.wikimedia.org/wiki/List_of_Wikipedias. */
  articles: { uk: 1_432_459, ru: 2_115_441 },
  /** The article's *quality* evidence: authors are recruited from readers. */
  editors: { uk: 4_813, ru: 16_558 },
  /** Ukrainian-edition pageviews, showing the platform-wide decline. */
  pageviewsMillions: { 2023: 1_188, 2025: 831 },
} as const;

export const wikipediaEarliest = wikipedia.rows[0];
export const wikipediaLatest = wikipedia.rows[2];

/* -------------------------------------------------------------- W3Techs */

interface WebPoint {
  year: string;
  ru: number;
  uk: number;
}

export const web = {
  ...({
    source: 'https://w3techs.com/technologies/overview/content_language',
    asOf: READ_ON,
  } satisfies Provenance),
  /** Points 2015–2025 are the 1 January readings; the last is 26 August 2026. */
  points: [
    { year: '2015', ru: 5.8, uk: 0.1 },
    { year: '2016', ru: 6.2, uk: 0.1 },
    { year: '2017', ru: 6.4, uk: 0.1 },
    { year: '2018', ru: 6.8, uk: 0.2 },
    { year: '2019', ru: 6, uk: 0.2 },
    { year: '2020', ru: 7.6, uk: 0.3 },
    { year: '2021', ru: 8.6, uk: 0.4 },
    { year: '2022', ru: 7, uk: 0.6 },
    { year: '2023', ru: 5.3, uk: 0.6 },
    { year: '2024', ru: 4.5, uk: 0.6 },
    { year: '2025', ru: 3.9, uk: 0.6 },
    { year: 'серп.\n2026', ru: 3.4, uk: 0.6 },
  ] as const satisfies readonly WebPoint[],
  peakYear: '2021',
} as const;

const webFirst = web.points[0];
/** The 2021 high. `article-figures.test.ts` pins this index to `peakYear`. */
export const webPeak = web.points[6];
export const webLast = web.points[11];

/* ----------------------------------------------------------------- Music */

export const music = {
  ...({
    source:
      'https://suspilne.media/culture/1110886-ukrainska-muzika-nabirae-obertiv-castka-pisen-ukrainskou-v-plejlistah-zrosla-do-57/',
    asOf: READ_ON,
  } satisfies Provenance),
  measures: [
    {
      label: 'Плейлісти з піснями українською',
      sub: 'частка серед плейлістів слухачів',
      from: 34,
      to: 57,
    },
    {
      label: 'Пісні українською на закордон',
      sub: 'частка серед випущеного українськими артистами',
      from: 27,
      to: 53,
    },
  ],
  fromYear: '2022',
  toYear: '2025',
  /** The counter-finding, which every surface carrying the bars must carry too. */
  tracksReleased: 68_900,
  releaseGrowthPercent: 39,
  newPerformers: 439,
} as const;

/* ------------------------------------------------- Catalogue of localisations */

export const catalogue = {
  ...({ source: 'https://kuli.com.ua/', asOf: '2026-08-26' } satisfies Provenance),
  official: 3_337,
  semiOfficial: 82,
  unofficial: 987,
  /** What the catalogue held two months after launch, June 2023. */
  atLaunch: 'понад 1 500',
} as const;

/**
 * Figures the article states in prose, each with the exact string the markdown
 * must contain. `article-figures.test.ts` walks this list; anything absent
 * fails the build rather than shipping a chart that disagrees with the
 * sentence beside it.
 *
 * Ratios and deltas are computed here from the series above, so they cannot
 * survive a change to their inputs.
 */
export function quotedFigures(): readonly { what: string; text: string }[] {
  return [
    // Steam — the climb, the stall, and the comparison.
    ...steam.readings
      .filter((reading) => reading.quoted)
      .map((reading) => ({
        what: `Steam, ${reading.label}`,
        text: formatShare(reading.share, 2),
      })),
    { what: 'Steam, російська', text: formatShare(steam.russianShare, 2) },
    {
      what: 'Steam, у скільки разів російська більша',
      text: ratio(steam.russianShare, steamLatest.share),
    },
    {
      what: 'Steam, приріст за перші 19 місяців',
      text: delta(steamClimb.from, steamClimb.to),
    },
    {
      what: 'Steam, приріст за наступні майже три роки',
      text: delta(steamStall.from, steamStall.to),
    },

    // Cyberpunk — before and after.
    { what: 'Cyberpunk, російська до', text: '88 зі 100' },
    { what: 'Cyberpunk, українська після', text: '42 зі 100' },
    { what: 'Cyberpunk, російська після', text: '47 зі 100' },

    { what: 'Відьмак 3, дата виходу ремастера', text: witcher.releasesOn },

    // Mewgenics — the vote that won, and the counter that decided.
    {
      what: 'Mewgenics, частка голосів за українську',
      text: formatShare(mewgenics.ukrainianVoteShare),
    },
    { what: 'Mewgenics, усього голосів', text: formatCount(mewgenics.totalVotes) },

    // Wikipedia — the three rows, the ratios, the depth figures.
    ...wikipedia.rows.flatMap((row) => [
      { what: `Wikipedia ${row.period}, українська`, text: formatShare(row.uk) },
      { what: `Wikipedia ${row.period}, російська`, text: formatShare(row.ru) },
    ]),
    {
      what: 'Wikipedia, розрив у 2013',
      text: ratio(wikipediaEarliest.ru, wikipediaEarliest.uk),
    },
    {
      what: 'Wikipedia, розрив у вересні 2025',
      text: ratio(wikipediaLatest.ru, wikipediaLatest.uk, 2),
    },
    { what: 'Wikipedia, статей українською', text: formatCount(wikipedia.articles.uk) },
    { what: 'Wikipedia, статей російською', text: formatCount(wikipedia.articles.ru) },
    { what: 'Wikipedia, дописувачів українською', text: formatCount(wikipedia.editors.uk) },
    { what: 'Wikipedia, дописувачів російською', text: formatCount(wikipedia.editors.ru) },
    {
      what: 'Wikipedia, перегляди 2023',
      text: `${formatCount(wikipedia.pageviewsMillions[2023])} млн`,
    },
    {
      what: 'Wikipedia, перегляди 2025',
      text: `${formatCount(wikipedia.pageviewsMillions[2025])} млн`,
    },

    // The open web.
    { what: 'Веб, пік російської', text: formatShare(webPeak.ru) },
    { what: 'Веб, російська зараз', text: formatShare(webLast.ru) },
    { what: 'Веб, українська на початку', text: formatShare(webFirst.uk) },
    { what: 'Веб, українська зараз', text: formatShare(webLast.uk) },
    {
      what: 'Веб, у скільки разів більше російських сайтів',
      text: ratio(webLast.ru, webLast.uk),
    },

    // Music.
    ...music.measures.flatMap((measure) => [
      { what: `Музика, ${measure.label} — ${music.fromYear}`, text: formatShare(measure.from, 0) },
      { what: `Музика, ${measure.label} — ${music.toYear}`, text: formatShare(measure.to, 0) },
    ]),
    { what: 'Музика, випущено пісень', text: formatCount(music.tracksReleased) },
    { what: 'Музика, приріст релізів', text: formatShare(music.releaseGrowthPercent, 0) },
    { what: 'Музика, нових виконавців', text: formatCount(music.newPerformers) },

    // Catalogue.
    { what: 'Каталог, офіційних', text: formatCount(catalogue.official) },
    { what: 'Каталог, напівофіційних', text: formatCount(catalogue.semiOfficial) },
    { what: 'Каталог, аматорських', text: formatCount(catalogue.unofficial) },
    { what: 'Каталог, на старті', text: catalogue.atLaunch },
  ];
}
