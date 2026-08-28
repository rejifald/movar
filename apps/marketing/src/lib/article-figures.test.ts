import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CitingArticle, CyberpunkBar } from './article-figures';
import {
  CITING_ARTICLES,
  aiOverview,
  brat2,
  catalogue,
  change,
  cyberpunk,
  delta,
  hellboy,
  formatCount,
  formatShare,
  macpaw,
  mewgenics,
  music,
  newsguard,
  ordinalFeminine,
  ordinalNeuter,
  ordinalShort,
  portalKombat,
  quotedFigures,
  ratio,
  steam,
  steamClimb,
  steamLatest,
  steamStall,
  surveyRank,
  surveyRunnerUp,
  surveyRussian,
  surveyUkrainian,
  surveyUkrainianNote,
  web,
  webLast,
  webPeak,
  webPeakUkrainian,
  wikipedia,
  wikipediaEarliest,
  wikipediaLatest,
  wikipediaPeak,
  witcher,
} from './article-figures';

/*
 * The guard behind «Мову рахують» and the survey «Тиха капітуляція» shares
 * with it.
 *
 * The posts ask readers to check them rather than believe them, so their
 * charts and their sentences have to agree. The two are produced by different
 * machinery — a React scene rendered to SVG, and hand-written Markdown — and
 * during drafting they disagreed twice. These tests make that disagreement a
 * failing build instead of something a reader finds.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.resolve(here, '../content/blog');

/**
 * Whitespace-insensitive view of the article.
 *
 * Two artefacts would otherwise produce failures that say nothing about the
 * data: the prose is hard-wrapped, so «47 зі 100» can straddle a line break,
 * and `formatCount` joins thousands with a no-break space so a chart cannot
 * split a number across lines — while the Markdown uses ordinary ones. Both
 * are typesetting, not disagreement, so every space becomes one plain space
 * on each side of the comparison.
 */
function flatten(text: string): string {
  return text.replace(/\s+/gu, ' ');
}

const ARTICLES = Object.fromEntries(
  CITING_ARTICLES.map((name) => [name, flatten(readFileSync(path.resolve(blogDir, name), 'utf8'))]),
) as Record<CitingArticle, string>;

/** «Мову рахують» — the post most of the assertions below are about. */
const article = ARTICLES['movu-rakhuyut.md'];

/**
 * A row's emphasis, read through the wide type.
 *
 * `as const` gives every bar its own literal type and the rows without
 * `emphasis` genuinely lack the property, so it cannot be read off the union
 * without widening first.
 */
function emphases(bars: readonly CyberpunkBar[]): (string | undefined)[] {
  return bars.map((bar) => bar.emphasis);
}

describe.each(CITING_ARTICLES)('%s — prose agrees with the data its charts render', (name) => {
  /*
   * The failure this catches: someone refreshes a figure in
   * `article-figures.ts` (so every chart redraws on the next `gen:charts`) and
   * the paragraph beside the chart keeps quoting the old value. `it.each`
   * names the offending figure in the failure, so the fix is one search away.
   *
   * Every article that cites the dataset is walked, not just the one the
   * dataset was built for. «Тиха капітуляція» was the case that proves why:
   * its chart was moved onto the shared survey while its sentences kept a
   * second transcription of the same table, and nothing read that file.
   */
  it.each(quotedFigures(name))('«$what» — $text is still in the article', ({ text }) => {
    expect(ARTICLES[name]).toContain(flatten(text));
  });
});

describe('derived numbers are computed, never transcribed', () => {
  /*
   * These are the sentences most likely to rot: a ratio stays plausible long
   * after its inputs move, so nothing prompts a writer to recheck it. Asserting
   * the computed form appears in the prose means updating an input either
   * updates the sentence or breaks the build.
   */
  it('states Russian on Steam as a multiple of Ukrainian', () => {
    expect(article).toContain(flatten(ratio(steam.russianShare, steamLatest.share)));
  });

  it('states the Steam climb and the stall as percentage-point changes', () => {
    expect(article).toContain(flatten(delta(steamClimb.from, steamClimb.to)));
    expect(article).toContain(flatten(delta(steamStall.from, steamStall.to)));
  });

  it('states the Wikipedia gap at both ends of the series', () => {
    expect(article).toContain(flatten(ratio(wikipediaEarliest.ru, wikipediaEarliest.uk)));
    expect(article).toContain(flatten(ratio(wikipediaLatest.ru, wikipediaLatest.uk, 2)));
  });

  it('states how many times more Russian-language sites there are', () => {
    expect(article).toContain(flatten(ratio(webLast.ru, webLast.uk)));
  });
});

describe('the helpers that turn figures into words', () => {
  /*
   * `delta()` is a size and says nothing about which way. The Steam bracket
   * used to print a hard-coded «плюс» beside it — on the one series in the
   * post whose direction is the argument, and the one likeliest to turn. These
   * pin the direction to the numbers so a decline cannot render as a gain.
   */
  it('gives a change the direction the data took', () => {
    expect(change(steamStall.from, steamStall.to)).toBe('плюс 0,06');
    expect(change(steamStall.to, steamStall.from)).toBe('мінус 0,06');
    expect(change(0.73, 0.7)).toBe('мінус 0,03');
    expect(change(0.7, 0.7)).toBe('без змін');
  });

  it('and the size on its own stays unsigned', () => {
    expect(delta(0.73, 0.7)).toBe(delta(0.7, 0.73));
  });

  /*
   * Every `ratio()` here divides one published share by another, so a zero
   * divisor means a series lost a reading. Announcing «Infinity раза» to a
   * screen reader is worse than a build that stops.
   */
  it('refuses to divide by a share that is not there', () => {
    expect(() => ratio(3.4, 0)).toThrow(/Infinity/u);
  });

  /*
   * The numeric ordinal takes the last two letters of the word it stands in
   * for, which is the actual Ukrainian rule — and the reason a single table
   * serves both the words the prose uses and the shorthand a chart label does.
   */
  it('writes an ordinal the way Ukrainian writes it', () => {
    expect(ordinalShort(1)).toBe('1-ше');
    expect(ordinalShort(3)).toBe('3-тє');
    expect(ordinalShort(7)).toBe('7-ме');
    expect(ordinalShort(15)).toBe('15-те');
    expect(ordinalFeminine(3)).toBe('третя');
    expect(ordinalNeuter(15)).toBe('пʼятнадцяте');
  });

  it('has no ordinal to offer for a rank the table cannot produce', () => {
    expect(() => ordinalShort(0)).toThrow();
    expect(() => ordinalNeuter(99)).toThrow();
  });
});

describe('named positions still point where they claim to', () => {
  /*
   * The anchors are literal tuple indices, which is what makes them safe to
   * read without a null check — and also what makes them silently wrong if a
   * reading is ever inserted into the middle of a series. These pin each one
   * to something self-describing, so an inserted row fails here rather than
   * relabelling a chart annotation.
   */
  it('webPeak is the year the dataset names as the peak', () => {
    expect(webPeak.year).toBe(web.peakYear);
    expect(webPeak.ru).toBe(Math.max(...web.points.map((point) => point.ru)));
  });

  it('webLast is the final point of the series', () => {
    expect(webLast).toBe(web.points.at(-1));
  });

  it('steamLatest is the final reading, and the stall runs to it', () => {
    expect(steamLatest).toBe(steam.readings.at(-1));
    expect(steamStall.to).toBe(steamLatest.share);
  });

  it('the survey anchors are the rows they claim to be', () => {
    expect(surveyUkrainian.name).toBe('Українська');
    expect(surveyRussian.name).toBe('Російська');
  });

  /*
   * The ranking scene's note and both articles' sentences say Ukrainian has
   * just passed Italian. That is a claim about two adjacent rows, so it is
   * pinned to the table rather than to the word: a survey where some other
   * language slots in between fails here, instead of shipping a note naming a
   * language Ukrainian no longer sits above.
   */
  it('the row Ukrainian is said to have passed is the one directly below it', () => {
    expect(surveyRank(surveyRunnerUp)).toBe(surveyRank(surveyUkrainian) + 1);
    expect(surveyRunnerUp.name).toBe('Італійська');
    expect(surveyUkrainian.share).toBeGreaterThan(surveyRunnerUp.share);
  });

  it('the ranking note states the place the table gives Ukrainian', () => {
    expect(surveyUkrainianNote).toBe(
      `${ordinalShort(surveyRank(surveyUkrainian))} місце — вже попереду ${surveyRunnerUp.genitive}`,
    );
  });

  /*
   * The Cyberpunk alt text names its six bars in table order — Russian first
   * in the «before» block, Ukrainian first in the «after» one. A bar inserted
   * anywhere ahead of those would leave the sentence describing the wrong row
   * with the right number, which is the failure hardest to spot by reading.
   */
  it('the Cyberpunk rows are in the order the alt text narrates', () => {
    expect(emphases(cyberpunk.before)).toEqual(['ru', undefined, undefined]);
    expect(emphases(cyberpunk.after)).toEqual(['ua', 'ru', undefined]);
  });

  it('wikipediaPeak is the row where the Ukrainian share is highest', () => {
    expect(wikipediaPeak.uk).toBe(Math.max(...wikipedia.rows.map((row) => row.uk)));
  });

  it('the highest Ukrainian reading on the web is the one the band is quoted from', () => {
    expect(webPeakUkrainian()).toBe(Math.max(...web.points.map((point) => point.uk)));
    expect(webPeakUkrainian()).toBeGreaterThan(webLast.uk);
  });

  it('the trend line ends on the same published number the ranking shows', () => {
    expect(steamLatest.share).toBe(surveyUkrainian.share);
    expect(steam.russianShare).toBe(surveyRussian.share);
  });

  it('the Wikipedia anchors are the first and last rows', () => {
    expect(wikipediaEarliest).toBe(wikipedia.rows[0]);
    expect(wikipediaLatest).toBe(wikipedia.rows.at(-1));
  });
});

describe('claims the charts would contradict', () => {
  /*
   * Two series in this post move slightly and are easy to write off as still.
   * The Steam tail rises to 0,73% and settles at 0,70%; the Ukrainian web
   * share sits at 0,6% for four years, touches 0,7% at the start of 2026 and
   * comes back. Both have labelled points that disprove any word asserting
   * stillness, so the size of the movement is quoted instead — the rule
   * `docs/articles/movu-rakhuyut.research.md` states for both sections.
   *
   * The list is the phrasings that were actually written, not ones nobody
   * would: «стоїть на місці» stood in the web paragraph while this guard
   * banned only the longer «стоїть на місці й далі», which is why it never
   * fired, and «майже без змін» sat in the Steam chart's alt text. Each entry
   * is kept short enough to survive a rewording and long enough not to fire on
   * prose that means something else — «клієнт стоїть російською» in the
   * sibling post is why «стоїть» on its own is not here.
   */
  it('never calls a moving series motionless', () => {
    for (const phrase of ['стоїть на місці', 'на одному місці', 'майже без змін', 'плато']) {
      expect(article).not.toContain(phrase);
    }
  });

  /*
   * The published «after» shares total 96%, not 100%. Any sentence summing the
   * two Russian rows into a single 93%, or presenting the after-set as a whole,
   * would be arithmetic the source never did.
   */
  it('never sums the Cyberpunk shares into a total the source did not publish', () => {
    const afterTotal = cyberpunk.after.reduce((sum, bar) => sum + bar.share, 0);
    expect(afterTotal).toBe(96);
    expect(article).not.toContain('93%');
    expect(article).not.toContain(flatten(formatShare(afterTotal, 0)));
  });

  /*
   * Volume without audience is the music section's own counter-finding. If the
   * flattering pair of bars is quoted, the release count has to be quoted too.
   */
  it('pairs the music growth with the release count behind it', () => {
    expect(article).toContain(flatten(formatCount(music.tracksReleased)));
    expect(article).toContain('тисячі прослуховувань');
  });
});

describe('the MacPaw claim stays on the checkable half', () => {
  /*
   * The easy error here is claiming the *product* had no Ukrainian. It did —
   * the January 2022 page lists it under «CleanMyMac X speaks:». Only the
   * marketing site lacked a Ukrainian locale, and that is what the prose says.
   */
  it('records that the app already spoke Ukrainian in the snapshot', () => {
    expect(macpaw.appSpokeUkrainianInSnapshot).toBe(true);
  });

  it('the snapshot site locales exclude Ukrainian and include Russian', () => {
    expect(macpaw.siteLocalesBefore).not.toContain('uk');
    expect(macpaw.siteLocalesBefore).toContain('ru');
  });

  it('and today they are the other way round', () => {
    expect(macpaw.siteLocalesNow).toContain('uk');
    expect(macpaw.siteLocalesNow).not.toContain('ru');
  });
});

describe('the search section admits what it cannot prove', () => {
  /*
   * The lead promises every number can be opened and recounted. `aiOverview`
   * is the one dataset that cannot be: no published data, no collection
   * window, no split by query language. Printing it quietly would spend the
   * credibility the rest of the post pays for, so the paragraph that prints it
   * says so outright — and this is what keeps the admission attached to the
   * figure when either one is next edited.
   */
  it('names the AI Overview figures as the ones a reader cannot recheck', () => {
    expect(aiOverview.datasetPublished).toBe(false);
    expect(article).toContain(flatten('Serpstat не оприлюднила ні набору даних'));
  });

  /*
   * Named incidents are evidence that a mechanism exists, never a rate at
   * which it fires — and «часто» is one adverb away from a claim nothing in
   * the sources supports.
   */
  it('never turns the named incidents into a frequency', () => {
    expect(article).toContain(flatten('Скільки рядків змінюють у дубляжі загалом, не рахує ніхто'));
    for (const phrase of ['часто змінюють', 'зазвичай змінюють', 'у більшості дубляжів']) {
      expect(article).not.toContain(phrase);
    }
  });

  /*
   * The Morning Show line is the section's sharpest example and the one most
   * easily misread: it is a pirate-stream voiceover, not a distributor's
   * release, which makes it evidence about what people watch rather than about
   * a market decision. Losing that word turns the example into a claim the
   * source does not make.
   */
  it('keeps the amateur voiceover marked as amateur', () => {
    expect(article).toContain(flatten('ця озвучка аматорська, а не студійна'));
  });

  /*
   * The section's counter-figure is a cost the reader pays, not a caveat about
   * somebody else: a Ukrainian query reaches the smaller corpus. It is the
   * same ratio the web section already charted, so it cannot drift from it.
   */
  it('prints the corpus gap as the price of switching, in the same section', () => {
    expect(article).toContain(flatten(`Ті ${ratio(webLast.ru, webLast.uk)} різниці`));
  });
});

describe('every figure carries its provenance', () => {
  /*
   * A number without a date is not evidence — it is a vibe that used to be
   * true. Every dataset names a URL a reader can open and the day it was read.
   */
  it.each([
    ['steam', steam],
    ['cyberpunk', cyberpunk],
    ['wikipedia', wikipedia],
    ['web', web],
    ['music', music],
    ['catalogue', catalogue],
    ['witcher', witcher],
    ['mewgenics', mewgenics],
    ['macpaw', macpaw],
    ['aiOverview', aiOverview],
    ['portalKombat', portalKombat],
    ['newsguard', newsguard],
    ['hellboy', hellboy],
    ['brat2', brat2],
  ])('%s names a source and the date it was read', (_name, dataset) => {
    expect(dataset.source).toMatch(/^https:\/\//);
    expect(dataset.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
