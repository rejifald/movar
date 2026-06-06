/**
 * Corpus-driven test for the franc-min engine. Runs the shared fixture set
 * from packages/lang-detect/test/fixtures.ts and asserts
 * `expectedEngineLanguage` against franc-min's actual output.
 *
 * v1 documented misses (do NOT paper over by weakening the assertion):
 *  - `he-pure`: franc-min lacks the Hebrew trigram model. Engine returns
 *    null; corpus expects 'he'. Future engine (ELD) or a Hebrew script-
 *    based shortcut would close this gap — tracked in the ADR's Future
 *    improvements list.
 *
 * Add a fixture in fixtures.ts whenever a real-world miss surfaces. The
 * corpus is shared with the orthogonal Cyrillic-heuristic test, so adding
 * exercise for both detectors is one paste.
 */

import { describe, expect, it } from 'vitest';
import { FIXTURES, type LanguageFixture } from '../../test/fixtures';
import { formatFailureMessage } from '../../test/format-fixture-failure';
import { francMinEngine } from './franc-min';

/** Fixtures franc-min v1 cannot resolve to the corpus's expected language.
 *  Each entry needs a reason — accepted limitations only, not silent failures. */
const KNOWN_MISSES: Readonly<Record<string, string>> = {
  'he-pure': 'franc-min lacks a Hebrew trigram model; returns und on Hebrew.',
};

describe('francMinEngine.isAvailable', () => {
  it('is always available', () => {
    expect(francMinEngine.isAvailable()).toBe(true);
  });
});

describe('francMinEngine.detect — corpus', () => {
  it.each(FIXTURES)('$id', async (fixture: LanguageFixture) => {
    const result = await francMinEngine.detect(fixture.text, {});
    const actual = result?.language ?? null;
    const knownMiss = KNOWN_MISSES[fixture.id];
    if (knownMiss) {
      expect(
        actual,
        `Fixture ${fixture.id} now passes — remove it from KNOWN_MISSES. Was: ${knownMiss}`,
      ).not.toBe(fixture.expectedEngineLanguage);
      return;
    }
    expect(actual, formatFailureMessage(fixture, actual)).toBe(fixture.expectedEngineLanguage);
  });
});

describe('francMinEngine.detect — engine contract', () => {
  it('annotates results with engine id and confidence in 0..1', async () => {
    const result = await francMinEngine.detect(
      'Today in London a new exhibition of contemporary British art opened. ' +
        'Artists presented works that reflect the cultural heritage of the country.',
      {},
    );
    expect(result?.engine).toBe('franc-min');
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });

  it('respects ctx.maxChars by slicing before detection', async () => {
    // First 50 chars are pure Cyrillic. Beyond that, English would dominate.
    const russianHead = 'Сегодня в Москве открылась новая выставка современного искусства.';
    const englishTail = ' '.repeat(1) + 'a'.repeat(3000);
    const result = await francMinEngine.detect(russianHead + englishTail, {
      maxChars: russianHead.length,
    });
    expect(result?.language).toBe('ru');
  });

  it('returns null for inputs shorter than franc-min minimum length (10 chars)', async () => {
    expect(await francMinEngine.detect('Hi', {})).toBeNull();
    expect(await francMinEngine.detect('Привет', {})).toBeNull();
  });

  it('returns null when franc-min cannot determine the script', async () => {
    expect(await francMinEngine.detect('12345 67890 3.14159', {})).toBeNull();
    expect(await francMinEngine.detect('!?... — ;:,.()[]', {})).toBeNull();
  });

  it('does not throw on AbortSignal in ctx — franc-min is synchronous', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    // The engine doesn't honor signal (sync work below the timeout), but the
    // call itself must complete cleanly so the orchestrator falls through if
    // needed.
    const result = await francMinEngine.detect('Today in London a new exhibition opened.', {
      signal: ctrl.signal,
    });
    expect(result?.language).toBe('en');
  });

  it('returns null for a language franc detects but the BCP-47 map omits', async () => {
    // franc-min identifies this Swahili text as ISO 639-3 'swh', which is NOT
    // in ISO_639_3_TO_BCP_47. The engine returns null — "rather miss than emit
    // an opaque three-letter tag the rest of the extension can't act on". If
    // 'sw' is ever added to the map this flips, reminding us to update.
    const swahili =
      'Leo katika jiji kubwa kumefunguliwa maonyesho mapya ya sanaa ya kisasa ya nchi yetu';
    expect(await francMinEngine.detect(swahili, {})).toBeNull();
  });
});
