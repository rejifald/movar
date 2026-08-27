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
 * asserts that every entry `quotedFigures()` returns still appears verbatim in
 * the markdown of the article that cites it, and `scripts/check-article-
 * charts.mts` re-renders every scene and compares it byte for byte against the
 * committed SVG — so a figure cannot move without the charts being regenerated
 * in the same commit.
 *
 * **Derived numbers are computed, never stored.** The ratios the prose quotes
 * — Russian is 13× Ukrainian on Steam, 4,3× on Wikipedia in 2013, 5,7× on the
 * open web — are quotients of figures already here. Storing them would create
 * exactly the drift this module exists to stop: update the numerator, forget
 * the ratio, ship a sentence the chart beside it disproves. `ratio()`,
 * `delta()` and `change()` below are the only way the article is allowed to
 * state one. The same rule covers words a figure decides: a rank is the row's
 * own index (`surveyRank`), never a typed-in «пʼятнадцяте».
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
 *
 * A zero denominator throws rather than returning «Infinity раза». Every
 * caller here divides one published share by another, so a zero means a series
 * lost a reading — and a scene that announces «Infinity раза» to a screen
 * reader is a worse outcome than a build that stops.
 */
export function ratio(a: number, b: number, digits = 1): string {
  if (b === 0) throw new Error('ratio(): the divisor is 0 — «Infinity раза» is not a sentence.');
  return `${(a / b).toFixed(digits).replace('.', ',')} раза`;
}

/** Percentage-point change between two shares, unsigned, e.g. «0,06». */
export function delta(from: number, to: number, digits = 2): string {
  return Math.abs(to - from)
    .toFixed(digits)
    .replace('.', ',');
}

/**
 * The same change with the direction the data actually took: «плюс 0,06»,
 * «мінус 0,06», «без змін».
 *
 * `delta()` alone is a size, and the one place the article prints a change on
 * a chart — the Steam bracket — used to hard-code «плюс» beside it. That is
 * the series whose *direction* is the whole argument and the one most likely
 * to turn: the last two readings are 0,73% and 0,70%, so the next refresh can
 * plausibly make the stall a decline, and the caption would still have read
 * «плюс». Deriving the word from the same two numbers the size comes from is
 * the only way the caption cannot contradict the line drawn under it.
 */
export function change(from: number, to: number, digits = 2): string {
  if (to === from) return 'без змін';
  return `${to > from ? 'плюс' : 'мінус'} ${delta(from, to, digits)}`;
}

/**
 * Ukrainian ordinals as words, one row per rank the survey table can produce.
 *
 * Two genders because the article needs both: «російська — третя мова» agrees
 * with «мова», «пʼятнадцяте місце» with «місце». They are language, not data —
 * which is exactly why they live here as a lookup rather than being typed into
 * a sentence: the *rank* is decided by the table's order, so a survey refresh
 * that moves Ukrainian up a place has to move every word that names the place
 * with it, and `article-figures.test.ts` fails until it does.
 */
/** «пʼятнадцяте» → «те». Every Ukrainian ordinal ending is two letters long. */
const ORDINAL_SUFFIX_LENGTH = 2;

const ORDINALS: readonly { feminine: string; neuter: string }[] = [
  { feminine: 'перша', neuter: 'перше' },
  { feminine: 'друга', neuter: 'друге' },
  { feminine: 'третя', neuter: 'третє' },
  { feminine: 'четверта', neuter: 'четверте' },
  { feminine: 'пʼята', neuter: 'пʼяте' },
  { feminine: 'шоста', neuter: 'шосте' },
  { feminine: 'сьома', neuter: 'сьоме' },
  { feminine: 'восьма', neuter: 'восьме' },
  { feminine: 'девʼята', neuter: 'девʼяте' },
  { feminine: 'десята', neuter: 'десяте' },
  { feminine: 'одинадцята', neuter: 'одинадцяте' },
  { feminine: 'дванадцята', neuter: 'дванадцяте' },
  { feminine: 'тринадцята', neuter: 'тринадцяте' },
  { feminine: 'чотирнадцята', neuter: 'чотирнадцяте' },
  { feminine: 'пʼятнадцята', neuter: 'пʼятнадцяте' },
  { feminine: 'шістнадцята', neuter: 'шістнадцяте' },
];

function ordinalAt(rank: number): { feminine: string; neuter: string } {
  const word = ORDINALS[rank - 1];
  if (word === undefined) throw new Error(`No Ukrainian ordinal written out for rank ${rank}.`);
  return word;
}

/** «третя» — for a rank read as a language: «російська — третя мова платформи». */
export function ordinalFeminine(rank: number): string {
  return ordinalAt(rank).feminine;
}

/** «пʼятнадцяте» — for a rank read as a place: «пʼятнадцяте місце». */
export function ordinalNeuter(rank: number): string {
  return ordinalAt(rank).neuter;
}

/**
 * «15-те» — the numeric shorthand a chart label uses where the word would not
 * fit.
 *
 * The ending is the last two letters of the word it stands in for, which is
 * Ukrainian's actual rule and the reason one table serves both forms: 1-ше,
 * 2-ге, 3-тє, 7-ме, 15-те. Spelling the endings out per digit instead would be
 * a second table to keep in agreement with the first.
 */
export function ordinalShort(rank: number): string {
  return `${rank}-${ordinalAt(rank).neuter.slice(-ORDINAL_SUFFIX_LENGTH)}`;
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

/**
 * The second sitting. MacPaw's two snapshots were opened a day after the rest,
 * and so were every source behind the search-and-translation section, which
 * was researched after the first review of the draft.
 */
const READ_ON_FOLLOW_UP = '2026-08-27';

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
  /**
   * The name in the genitive, for a note that points at this row from above —
   * «вже попереду італійської». Grammar rather than a figure, so it is written
   * out; which row a note actually points at is decided by the table's order.
   */
  genitive?: string;
  /** Composed, never typed: see `surveyUkrainianNote`. */
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
  { name: 'Українська', share: 0.7, emphasis: 'ua' },
  { name: 'Італійська', share: 0.63, genitive: 'італійської' },
] as const satisfies readonly SurveyLanguage[];

/** The two rows the trend scene and the prose both lean on. Indices into the
 *  narrow tuple, pinned to their names by `article-figures.test.ts`. */
export const surveyUkrainian = SURVEY_LANGUAGES[14];
export const surveyRussian = SURVEY_LANGUAGES[2];
/** The row Ukrainian now sits directly above — what its note points at. */
export const surveyRunnerUp = SURVEY_LANGUAGES[15];

/**
 * Where a language stands in the published table, counting from one.
 *
 * The table is printed in the survey's own order, so a row's position *is* the
 * rank — and reading it off the array is what stops «третя» and «пʼятнадцяте»
 * from being two more transcriptions that a refreshed survey leaves behind.
 */
export function surveyRank(row: SurveyLanguage): number {
  const index = (SURVEY_LANGUAGES as readonly SurveyLanguage[]).indexOf(row);
  if (index === -1) throw new Error(`«${row.name}» is not a row of the published survey table.`);
  return index + 1;
}

/**
 * Ukrainian's note in the ranking scene: its place, and what it has just
 * passed.
 *
 * Both halves are read off the table rather than typed beside it. The place is
 * the row's own index — a stored «15-те» is a chart announcing a rank the data
 * no longer gives it — and the language named is whichever row now follows,
 * in its own genitive. `article-figures.test.ts` pins that neighbour, so a
 * reshuffled survey fails there instead of shipping a note about the wrong
 * language.
 */
export const surveyUkrainianNote = `${ordinalShort(surveyRank(surveyUkrainian))} місце — вже попереду ${surveyRunnerUp.genitive}`;

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
   * anchors above index into it safely.
   *
   * The note is attached here rather than stored on the row because it is
   * derived from the row's position, which the literal cannot see while it is
   * still being written.
   */
  languages: SURVEY_LANGUAGES.map((row) =>
    row === surveyUkrainian ? { ...row, note: surveyUkrainianNote } : row,
  ) as readonly SurveyLanguage[],
} as const;

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

/**
 * MacPaw — the same arithmetic, run by a Kyiv company on its own site.
 *
 * Verified from the pages themselves rather than from anybody's account of a
 * decision, which is the only reason it is here: the January 2022 snapshot and
 * the live page both list their locales in markup, so a reader can open the two
 * and count.
 *
 * The distinction is load-bearing and easy to get wrong. **CleanMyMac the app
 * already spoke Ukrainian in January 2022** — its own product page said so
 * under «CleanMyMac X speaks:», listing thirteen languages including both
 * Ukrainian and Russian. What had no Ukrainian was `macpaw.com` itself: the
 * marketing site shipped in thirteen locales, Russian and Norwegian Nynorsk
 * among them, and not Ukrainian. Claiming the product lacked Ukrainian would
 * be false; the site is the true and checkable version.
 *
 * No motive is attributed anywhere. Sites are localised toward where buyers
 * come from, and that sum reads the same in Kyiv as anywhere else — which is
 * the whole point of including it.
 */
export const macpaw = {
  ...({
    source: 'https://web.archive.org/web/20220102201104/https://macpaw.com/cleanmymac',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  snapshot: 'січень 2022',
  /** `macpaw.com` locales in that snapshot — no `uk`. */
  siteLocalesBefore: ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'ru', 'sv'],
  /** The same switcher today: Ukrainian in, Russian gone. */
  siteLocalesNow: ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'sv', 'uk'],
  /** The nuance that keeps the claim honest — see the note above. */
  appSpokeUkrainianInSnapshot: true,
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

/**
 * The row where the Ukrainian share is highest — 2024.
 *
 * It has an anchor because the article names it, and named it wrongly: the
 * prose dated the maximum to 2023, a year this table has no row for and the
 * research doc has no source for. The only ~39% reading in any of the sources
 * is the 2024 annual figure, which is what the chart has always labelled.
 * `article-figures.test.ts` pins this to the actual maximum, so the sentence
 * cannot again name a year the series does not contain.
 */
export const wikipediaPeak = wikipedia.rows[1];

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
  /**
   * Every point but the last is a 1 January reading; the last is 26 August
   * 2026, which is why its axis label carries the month.
   *
   * The 1 January 2026 reading is here because the article's sentence needs
   * it: Ukrainian «коливається між 0,6% і 0,7%», and 0,7% happens on exactly
   * this one point. It was left out of the first pass — the series then ran
   * 2015…2025 and jumped straight to August 2026 — which drew a flat 0,6%
   * line under a sentence describing a wobble, in a post whose entire promise
   * is that the two agree. The reading is in the same W3Techs history table as
   * every other point, read on the same day.
   */
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
    { year: 'січ.\n2026', ru: 3.7, uk: 0.7 },
    { year: 'серп.\n2026', ru: 3.4, uk: 0.6 },
  ] as const satisfies readonly WebPoint[],
  peakYear: '2021',
} as const;

export const webFirst = web.points[0];
/** The 2021 high. `article-figures.test.ts` pins this index to `peakYear`. */
export const webPeak = web.points[6];
export const webLast = web.points[12];

/**
 * The highest Ukrainian reading in the series.
 *
 * Unlike `webPeak` this has no year attached on purpose. It exists to bound a
 * sentence — the share has moved between 0,6% and 0,7% since 2022 — and the
 * article makes no claim about *when* the top of that band happens, so nothing
 * here should have to be revised when it moves.
 */
export function webPeakUkrainian(): number {
  return Math.max(...web.points.map((point) => point.uk));
}

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

/* ------------------------------------------- What the language also selects */

/*
 * Everything above measures what a language setting *adds to* somebody else's
 * table. The four entries below measure what it *subtracts from* what the
 * reader is shown: the language of a query picks the corpus that answers it,
 * and a dubbed track picks the sentence. Same setting, a cost paid today
 * rather than a localisation funded later.
 *
 * The evidence is a different shape — two published reports and two documented
 * incidents, not a series — so no chart reads from this block. Nobody
 * publishes a rate of altered lines, and inventing a denominator for one would
 * be the exact failure this module exists to prevent.
 */

/**
 * Google's AI Overview in results aimed at Ukraine, by the domain zone of the
 * sources it cites.
 *
 * **The one figure in the post a reader cannot re-derive**, and the only entry
 * here whose source is not itself a published dataset: Serpstat is a Kyiv
 * search-analytics company, these numbers appeared in a column by one of its
 * analysts, and neither the collection window nor the split by query language
 * was given. It is printed because it is the only measurement of this
 * mechanism found at all — and the paragraph printing it says outright that
 * the article's «open it and recount it» promise does not cover this one.
 * `article-figures.test.ts` holds that admission in place.
 */
export const aiOverview = {
  ...({
    source:
      'https://focus.ua/uk/opinions/764285-komu-naspravdi-doviryaye-shtuchniy-intelekt-google-v-ukrajini',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  publishedOn: '12 серпня 2026',
  /** Two roughly equal samples from Google Ukraine's keyword base. */
  sampleEachLanguage: 2_500_000,
  /** Answers built only on `.ru` domains, carrying no Ukrainian source at all. */
  ruOnlyShare: 19.69,
  /** Answers mixing Ukrainian and Russian sources in one block. */
  mixedShare: 31.57,
  /** How often a query written in Ukrainian is answered in Ukrainian. */
  languageMatchShare: 90.8,
  /** No dataset, no collection window, no per-language breakdown. */
  datasetPublished: false,
} as const;

/**
 * Portal Kombat — the part of the Russian-language corpus that was put there.
 *
 * A state agency's own published count rather than anyone's characterisation:
 * VIGINUM is the French government service for foreign digital interference,
 * and 193 is the number of portals in its February 2024 report. Kept on the
 * mechanism and off the motive (`docs/copy.md` §1.6, §3.4) — this is an entry
 * about a network of sites and what two named organisations counted in it,
 * never about a country or a people.
 */
export const portalKombat = {
  ...({
    source:
      'https://www.sgdsn.gouv.fr/files/files/20240212_NP_SGDSN_VIGINUM_PORTAL-KOMBAT-NETWORK_ENG_VF.pdf',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  reportedOn: 'лютий 2024',
  portals: 193,
} as const;

/**
 * What NewsGuard measured a year later: how much of that network comes back
 * out of the chatbots people increasingly ask instead of searching.
 */
export const newsguard = {
  ...({
    source:
      'https://www.newsguardtech.com/special-reports/moscow-based-global-news-network-infected-western-artificial-intelligence-russian-propaganda/',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  publishedOn: '6 березня 2025',
  /** Articles the network published across 2024. */
  articles2024: 3_600_000,
  chatbotsAudited: 10,
  /** Share of the audited answers that repeated the network's claims. */
  repeatShare: 33,
} as const;

/**
 * Hellboy (2019) — the dub that named a different dictator.
 *
 * The «makes one side look better» half of the translation argument, and the
 * better-sourced of the two: the BBC reported the swap, and the same change
 * reached the original-language screenings, where the name was bleeped out of
 * the audio and the subtitle carried the substitute.
 */
export const hellboy = {
  ...({
    source: 'https://www.bbc.com/news/blogs-news-from-elsewhere-47964774',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  releasedOn: 'квітень 2019',
  /** Whose ghost the line raises in the original, and in the Russian track. */
  original: 'Сталіна',
  dubbed: 'Гітлера',
} as const;

/**
 * «Брат-2» on Netflix, June 2021 — the same mechanism pointed the other way.
 *
 * A subtitle is where this one is checkable: the Russian line is a label one
 * character puts on another, and the English rendering turned it into a
 * description for an audience with no way to notice. Corrected within hours
 * once it was noticed, which is what makes the before-and-after citable.
 *
 * The people who raised it are deliberately unnamed — the entry is about what
 * the two subtitle strings say, and reporting on who complained varies.
 */
export const brat2 = {
  ...({
    source:
      'https://detector.media/infospace/article/188699/2021-06-02-netflix-vypravyv-subtytry-u-filmi-brat-2-pro-banderivtsiv-kolaborantiv-natsystiv/',
    asOf: READ_ON_FOLLOW_UP,
  } satisfies Provenance),
  correctedOn: '2 червня 2021',
  /** What the English subtitle rendered «бандерівець» as. */
  subtitleBefore: 'Ukrainian Nazi collaborator',
  /** And what it became. */
  subtitleAfter: 'banderite',
} as const;

/** One figure, and the exact string the article stating it must contain. */
export interface QuotedFigure {
  what: string;
  text: string;
}

/**
 * The blog posts that cite this dataset, by filename under
 * `src/content/blog/`.
 *
 * Two, and the second one is the reason this is a list rather than a constant.
 * «Тиха капітуляція» quotes the same July survey «Мову рахують» does, and its
 * chart was moved onto this module while its *sentences* were left holding a
 * second transcription of the table — «9,3%», «третя», «пʼятнадцяте місце» —
 * that nothing read. A dataset shared by two articles has to be checked
 * against both, or the guard only proves the copy it happens to open.
 *
 * `docs/articles/dou-tykha-kapitulyatsiya.md` holds a third copy and is
 * deliberately absent: it is the archival record of the text that went to
 * dou.ua, and its own header says the two copies diverge on purpose. Pinning a
 * published-elsewhere record to a live dataset would force edits that make it
 * stop matching what dou.ua actually shows.
 */
export const CITING_ARTICLES = ['movu-rakhuyut.md', 'tykha-kapitulyatsiya.md'] as const;

export type CitingArticle = (typeof CITING_ARTICLES)[number];

/**
 * Figures an article states, each with the exact string its markdown must
 * contain. `article-figures.test.ts` walks the list for every article above;
 * anything absent fails the build rather than shipping a chart that disagrees
 * with the sentence beside it.
 *
 * Ratios, deltas and ranks are computed here from the series above, so they
 * cannot survive a change to their inputs.
 */
export function quotedFigures(article: CitingArticle): readonly QuotedFigure[] {
  return article === 'movu-rakhuyut.md' ? movuRakhuyutFigures() : tykhaKapitulyatsiyaFigures();
}

/**
 * What «Тиха капітуляція» states about the July survey.
 *
 * Shorter than its sibling because the survey is the only dataset it shares —
 * the rest of that post is about the extension, not about published figures.
 * Both the shares and the two ranks are here: the ranks are as much a reading
 * of the table as the percentages, and the older of the two goes stale in the
 * same silence.
 */
function tykhaKapitulyatsiyaFigures(): readonly QuotedFigure[] {
  return [
    { what: 'Steam, місяць опитування', text: steamSurvey.month },
    { what: 'Steam, російська', text: formatShare(surveyRussian.share) },
    { what: 'Steam, російська — на діаграмі', text: formatShare(surveyRussian.share, 2) },
    {
      what: 'Steam, місце російської',
      text: ordinalFeminine(surveyRank(surveyRussian)),
    },
    { what: 'Steam, українська', text: formatShare(surveyUkrainian.share) },
    {
      what: 'Steam, місце української',
      text: ordinalNeuter(surveyRank(surveyUkrainian)),
    },
    {
      what: 'Steam, місце української — на діаграмі',
      text: ordinalFeminine(surveyRank(surveyUkrainian)),
    },
    {
      what: 'Steam, українська вже попереду наступної мови',
      text: `${formatShare(surveyUkrainian.share, 2)} проти ${formatShare(surveyRunnerUp.share, 2)}`,
    },
  ];
}

function movuRakhuyutFigures(): readonly QuotedFigure[] {
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

    {
      what: 'MacPaw, скільки локалей мав сайт у 2022',
      text: `${macpaw.siteLocalesBefore.length} мовами`,
    },

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
    /*
     * The maximum and the year it falls on, as one string, because separating
     * them is how the sentence went wrong: it printed «близько 39%» — near
     * enough to the 2024 row to look right — and dated it to 2023, a period
     * the table does not hold.
     */
    {
      what: 'Wikipedia, максимум української',
      text: `${formatShare(wikipediaPeak.uk)} у ${wikipediaPeak.period} році`,
    },
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
    /*
     * The top of the band the section says Ukrainian has moved inside since
     * 2022. Computed rather than named, so the sentence cannot outlive the
     * reading that justifies it: drop the point that reaches 0,7% and this
     * entry becomes 0,6%, and the prose fails until it says so too.
     */
    { what: 'Веб, найвище значення української', text: formatShare(webPeakUkrainian()) },
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

    // Пошук — мова запиту, і чиї джерела на неї відповідають.
    {
      what: 'AI Overview, відповідь мовою запиту',
      text: formatShare(aiOverview.languageMatchShare),
    },
    { what: 'AI Overview, лише домени .ru', text: formatShare(aiOverview.ruOnlyShare, 2) },
    { what: 'AI Overview, змішані джерела', text: formatShare(aiOverview.mixedShare, 2) },
    { what: 'Portal Kombat, сайтів у мережі', text: formatCount(portalKombat.portals) },
    { what: 'NewsGuard, статей за 2024 рік', text: formatCount(newsguard.articles2024) },
    {
      what: 'NewsGuard, частка відповідей із твердженнями мережі',
      text: formatShare(newsguard.repeatShare, 0),
    },

    // Переклад — той самий рядок у двох версіях.
    { what: '«Брат-2», субтитр до виправлення', text: brat2.subtitleBefore },
    { what: '«Брат-2», субтитр після виправлення', text: brat2.subtitleAfter },
  ];
}
