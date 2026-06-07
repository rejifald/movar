/**
 * Corpus-driven test for the franc engine. Runs the shared fixture set from
 * packages/lang-detect/test/fixtures.ts and asserts `expectedEngineLanguage`
 * against franc's actual output.
 *
 * This doubles as the franc-187 regression gate: every fixture (Russian
 * especially) must keep resolving to its expected language. franc (187 langs)
 * carries Hebrew, so the old franc-min `he-pure` known-miss is gone — Hebrew is
 * now expected to resolve. Add a fixture in fixtures.ts whenever a real-world
 * miss surfaces; the corpus is shared with the orthogonal Cyrillic-heuristic
 * test, so adding exercise for both detectors is one paste.
 */

import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../test/fixtures';
import type { LanguageFixture } from '../../test/fixtures';
import { formatFailureMessage } from '../../test/format-fixture-failure';
import { francEngine } from './franc';

/** Fixtures franc cannot resolve to the corpus's expected language. Each entry
 *  needs a reason — accepted limitations only, not silent failures.
 *
 *  franc (187 langs) closes franc-min's Hebrew gap (`he-pure` now resolves) but,
 *  with a larger competitor set, abstains on a couple of SHORT mixed-script
 *  English samples that franc-min called confidently. These are benign for the
 *  extension — English is never blocked, so an `en` miss never triggers a switch
 *  or a hide — so they're documented here rather than fixed. No Cyrillic fixture
 *  regressed (the languages the extension actually acts on). */
const KNOWN_MISSES: Readonly<Record<string, string>> = {
  'en-with-de-citation':
    'franc (187) abstains on short English diluted by a German citation — the larger European competitor set drops English below franc’s trigram floor. Benign: English is never blocked.',
  'emoji-in-english':
    'franc (187) abstains on short emoji-laden English — the emoji thin the sample below a confident trigram lead. Benign: English is never blocked.',
};

describe('francEngine.isAvailable', () => {
  it('is always available', () => {
    expect(francEngine.isAvailable()).toBe(true);
  });
});

describe('francEngine.detect — corpus', () => {
  it.each(FIXTURES)('$id', async (fixture: LanguageFixture) => {
    const result = await francEngine.detect(fixture.text, {});
    const actual = result?.language ?? null;
    const knownMiss = KNOWN_MISSES[fixture.id];
    const isKnownMiss = knownMiss !== undefined;
    const matchedCorpus = actual === fixture.expectedEngineLanguage;
    // Known misses must keep missing (so we notice and prune the entry when an
    // engine upgrade closes the gap); every other fixture must match the corpus.
    // Single unconditional assertion — vitest/no-conditional-expect forbids an
    // `expect` guarded by the `knownMiss` branch.
    const message = isKnownMiss
      ? `Fixture ${fixture.id} now passes — remove it from KNOWN_MISSES. Was: ${knownMiss}`
      : formatFailureMessage(fixture, actual);
    // eslint-disable-next-line vitest/valid-expect -- vitest's expect() takes a custom failure message as its 2nd arg (verified at runtime); the rule's maxArgs:1 default is a Jest-ism
    expect(matchedCorpus, message).toBe(!isKnownMiss);
  });
});

describe('francEngine.detect — engine contract', () => {
  it('annotates results with engine id and confidence in 0..1', async () => {
    const result = await francEngine.detect(
      'Today in London a new exhibition of contemporary British art opened. ' +
        'Artists presented works that reflect the cultural heritage of the country.',
      {},
    );
    expect(result?.engine).toBe('franc');
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });

  it('respects ctx.maxChars by slicing before detection', async () => {
    // First 50 chars are pure Cyrillic. Beyond that, English would dominate.
    const russianHead = 'Сегодня в Москве открылась новая выставка современного искусства.';
    const englishTail = ' '.repeat(1) + 'a'.repeat(3000);
    const result = await francEngine.detect(russianHead + englishTail, {
      maxChars: russianHead.length,
    });
    expect(result?.language).toBe('ru');
  });

  it('returns null for inputs shorter than franc minimum length (10 chars)', async () => {
    expect(await francEngine.detect('Hi', {})).toBeNull();
    expect(await francEngine.detect('Привет', {})).toBeNull();
  });

  it('returns null when franc cannot determine the script', async () => {
    expect(await francEngine.detect('12345 67890 3.14159', {})).toBeNull();
    expect(await francEngine.detect('!?... — ;:,.()[]', {})).toBeNull();
  });

  it('does not throw on AbortSignal in ctx — franc is synchronous', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    // The engine doesn't honor signal (sync work below the timeout), but the
    // call itself must complete cleanly so the orchestrator falls through if
    // needed.
    const result = await francEngine.detect('Today in London a new exhibition opened.', {
      signal: ctrl.signal,
    });
    expect(result?.language).toBe('en');
  });

  it('returns null for a language franc detects but the BCP-47 map omits', async () => {
    // franc identifies this Swahili text as an ISO 639-3 code NOT in
    // ISO_639_3_TO_BCP_47. The engine returns null — "rather miss than emit an
    // opaque three-letter tag the rest of the extension can't act on". If 'sw'
    // is ever added to the map this flips, reminding us to update.
    const swahili =
      'Leo katika jiji kubwa kumefunguliwa maonyesho mapya ya sanaa ya kisasa ya nchi yetu';
    expect(await francEngine.detect(swahili, {})).toBeNull();
  });
});
