import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  aiOverview,
  brat2,
  catalogue,
  cyberpunk,
  delta,
  hellboy,
  formatCount,
  formatShare,
  macpaw,
  mewgenics,
  music,
  newsguard,
  portalKombat,
  quotedFigures,
  ratio,
  steam,
  steamClimb,
  steamLatest,
  steamStall,
  surveyRussian,
  surveyUkrainian,
  web,
  webLast,
  webPeak,
  wikipedia,
  wikipediaEarliest,
  wikipediaLatest,
  witcher,
} from './article-figures';

/*
 * The guard behind «Мову рахують».
 *
 * The post asks readers to check it rather than believe it, so its charts and
 * its sentences have to agree. They are produced by different machinery — a
 * React scene screenshotted into a PNG, and hand-written Markdown — and during
 * drafting they disagreed twice. These tests make that disagreement a failing
 * build instead of something a reader finds.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const articlePath = path.resolve(here, '../content/blog/movu-rakhuyut.md');

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

const article = flatten(readFileSync(articlePath, 'utf8'));

describe('article figures — prose agrees with the data the charts render', () => {
  /*
   * The failure this catches: someone refreshes a figure in
   * `article-figures.ts` (so every chart updates on the next capture) and the
   * paragraph beside the chart keeps quoting the old value. `it.each` names the
   * offending figure in the failure, so the fix is one search away.
   */
  it.each(quotedFigures())('«$what» — $text is still in the article', ({ text }) => {
    expect(article).toContain(flatten(text));
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
   * The Steam tail is not flat — it rises to 0,73% and settles at 0,70%. An
   * earlier draft called it «на одному місці», which the chart's own labelled
   * points disprove. Words that assert stillness are banned from that section;
   * the size of the drift is quoted instead.
   */
  it('never calls the Steam tail motionless', () => {
    for (const phrase of [
      'на одному місці',
      'без руху',
      'не рухається',
      'стоїть на місці й далі',
    ]) {
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
   * Two documented translations are evidence that a mechanism exists, never a
   * rate at which it fires — and «часто» is one adverb away from a claim
   * nothing in the sources supports.
   */
  it('never turns two incidents into a frequency', () => {
    expect(article).toContain(flatten('Два випадки — це не частота'));
    for (const phrase of ['часто змінюють', 'зазвичай змінюють', 'у більшості дубляжів']) {
      expect(article).not.toContain(phrase);
    }
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
