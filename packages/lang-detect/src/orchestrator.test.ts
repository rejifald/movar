import { describe, expect, it, vi } from 'vitest';
import type { DetectedLanguage, LanguageDetectionEngine } from './engine';
import { ENGINES, detectLanguageFromText, detectLanguageFromTextWith } from './orchestrator';

function makeEngine(
  id: string,
  detect: LanguageDetectionEngine['detect'],
  isAvailable: LanguageDetectionEngine['isAvailable'] = () => true,
): LanguageDetectionEngine {
  return { id, isAvailable, detect };
}

function ok(language: string, engine: string, confidence = 0.9): DetectedLanguage {
  return { language, confidence, engine };
}

/** A `detect` stub that resolves to `verdict`. Built with `vi.fn().mockResolvedValue`
 *  rather than `async () => verdict`: a constant-returning async arrow has no `await`
 *  (require-await) while the `() => Promise.resolve(verdict)` form trips
 *  promise-function-async — the mock builder satisfies both, and the result is still
 *  a spy so `.toHaveBeenCalled()` assertions keep working. */
function resolvingDetect(verdict: DetectedLanguage | null): LanguageDetectionEngine['detect'] {
  return vi.fn<LanguageDetectionEngine['detect']>().mockResolvedValue(verdict);
}

describe('detectLanguageFromTextWith', () => {
  it('returns null when no engines are supplied', async () => {
    const result = await detectLanguageFromTextWith([], 'some text');
    expect(result).toBeNull();
  });

  it('returns the first non-null engine result', async () => {
    const first = makeEngine('first', resolvingDetect(ok('uk', 'first')));
    const second = makeEngine('second', resolvingDetect(ok('ru', 'second')));
    const result = await detectLanguageFromTextWith([first, second], 'text');
    expect(result?.language).toBe('uk');
    expect(result?.engine).toBe('first');
    expect(second.detect).not.toHaveBeenCalled();
  });

  it('skips engines whose isAvailable() returns false', async () => {
    const detect = resolvingDetect(ok('uk', 'unavail'));
    const unavail = makeEngine('unavail', detect, () => false);
    const fallback = makeEngine('fallback', resolvingDetect(ok('ru', 'fallback')));
    const result = await detectLanguageFromTextWith([unavail, fallback], 'text');
    expect(detect).not.toHaveBeenCalled();
    expect(result?.engine).toBe('fallback');
  });

  it('awaits async isAvailable() before deciding to skip', async () => {
    const detect = resolvingDetect(ok('uk', 'flaky'));
    const flaky = makeEngine(
      'flaky',
      detect,
      vi.fn<LanguageDetectionEngine['isAvailable']>().mockResolvedValue(false),
    );
    const fallback = makeEngine('fallback', resolvingDetect(ok('ru', 'fallback')));
    const result = await detectLanguageFromTextWith([flaky, fallback], 'text');
    expect(detect).not.toHaveBeenCalled();
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine isAvailable() throws synchronously', async () => {
    // A broken availability check must not abort the whole roster.
    const detect = resolvingDetect(ok('uk', 'broken'));
    const broken = makeEngine('broken', detect, () => {
      throw new Error('availability boom');
    });
    const fallback = makeEngine('fallback', resolvingDetect(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
    expect(detect).not.toHaveBeenCalled();
  });

  it('falls through when an engine isAvailable() rejects', async () => {
    const detect = resolvingDetect(ok('uk', 'broken'));
    const broken = makeEngine(
      'broken',
      detect,
      vi
        .fn<LanguageDetectionEngine['isAvailable']>()
        .mockRejectedValue(new Error('availability boom')),
    );
    const fallback = makeEngine('fallback', resolvingDetect(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
    expect(detect).not.toHaveBeenCalled();
  });

  it('falls through when an engine throws synchronously', async () => {
    const broken = makeEngine('broken', () => {
      throw new Error('boom');
    });
    const fallback = makeEngine('fallback', resolvingDetect(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine returns a rejected promise', async () => {
    const broken = makeEngine(
      'broken',
      vi.fn<LanguageDetectionEngine['detect']>().mockRejectedValue(new Error('boom')),
    );
    const fallback = makeEngine('fallback', resolvingDetect(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine returns null', async () => {
    const abstain = makeEngine('abstain', resolvingDetect(null));
    const fallback = makeEngine('fallback', resolvingDetect(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([abstain, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('returns null when every engine abstains', async () => {
    const a = makeEngine('a', resolvingDetect(null));
    const b = makeEngine('b', resolvingDetect(null));
    const result = await detectLanguageFromTextWith([a, b], 'text');
    expect(result).toBeNull();
  });

  it('does not propagate errors out of the orchestrator', async () => {
    const broken = makeEngine(
      'broken',
      vi.fn<LanguageDetectionEngine['detect']>().mockRejectedValue(new Error('boom')),
    );
    await expect(detectLanguageFromTextWith([broken], 'text')).resolves.toBeNull();
  });

  it('passes the AbortSignal from DetectContext to engines', async () => {
    const ctrl = new AbortController();
    const recorder = vi.fn<LanguageDetectionEngine['detect']>().mockResolvedValue(null);
    await detectLanguageFromTextWith([makeEngine('recorder', recorder)], 'text', {
      signal: ctrl.signal,
    });
    expect(recorder).toHaveBeenCalledWith('text', expect.objectContaining({ signal: ctrl.signal }));
  });

  it('forwards maxChars from DetectContext to engines', async () => {
    const recorder = vi.fn<LanguageDetectionEngine['detect']>().mockResolvedValue(null);
    await detectLanguageFromTextWith([makeEngine('recorder', recorder)], 'text', { maxChars: 500 });
    expect(recorder).toHaveBeenCalledWith('text', expect.objectContaining({ maxChars: 500 }));
  });
});

describe('detectLanguageFromText', () => {
  it('delegates to the live ENGINES roster', async () => {
    expect(ENGINES.length).toBeGreaterThan(0);
    const result = await detectLanguageFromText(
      'Today in London a new exhibition opened. The artists presented works that reflect ' +
        'the cultural heritage of the country.',
    );
    expect(result?.language).toBe('en');
  });

  it('returns null on text every engine declines', async () => {
    const result = await detectLanguageFromText('12345 67890');
    expect(result).toBeNull();
  });
});
