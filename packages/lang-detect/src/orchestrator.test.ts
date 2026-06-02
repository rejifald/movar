import { describe, expect, it, vi } from 'vitest';
import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';
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

describe('detectLanguageFromTextWith', () => {
  it('returns null when no engines are supplied', async () => {
    const result = await detectLanguageFromTextWith([], 'some text');
    expect(result).toBeNull();
  });

  it('returns the first non-null engine result', async () => {
    const first = makeEngine(
      'first',
      vi.fn(() => Promise.resolve(ok('uk', 'first'))),
    );
    const second = makeEngine(
      'second',
      vi.fn(() => Promise.resolve(ok('ru', 'second'))),
    );
    const result = await detectLanguageFromTextWith([first, second], 'text');
    expect(result?.language).toBe('uk');
    expect(result?.engine).toBe('first');
    expect(second.detect).not.toHaveBeenCalled();
  });

  it('skips engines whose isAvailable() returns false', async () => {
    const detect = vi.fn(() => Promise.resolve(ok('uk', 'unavail')));
    const unavail = makeEngine('unavail', detect, () => false);
    const fallback = makeEngine(
      'fallback',
      vi.fn(() => Promise.resolve(ok('ru', 'fallback'))),
    );
    const result = await detectLanguageFromTextWith([unavail, fallback], 'text');
    expect(detect).not.toHaveBeenCalled();
    expect(result?.engine).toBe('fallback');
  });

  it('awaits async isAvailable() before deciding to skip', async () => {
    const detect = vi.fn(() => Promise.resolve(ok('uk', 'flaky')));
    const flaky = makeEngine('flaky', detect, () => Promise.resolve(false));
    const fallback = makeEngine(
      'fallback',
      vi.fn(() => Promise.resolve(ok('ru', 'fallback'))),
    );
    const result = await detectLanguageFromTextWith([flaky, fallback], 'text');
    expect(detect).not.toHaveBeenCalled();
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine throws synchronously', async () => {
    const broken = makeEngine('broken', () => {
      throw new Error('boom');
    });
    const fallback = makeEngine('fallback', () => Promise.resolve(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine returns a rejected promise', async () => {
    const broken = makeEngine('broken', () => Promise.reject(new Error('boom')));
    const fallback = makeEngine('fallback', () => Promise.resolve(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([broken, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('falls through when an engine returns null', async () => {
    const abstain = makeEngine('abstain', () => Promise.resolve(null));
    const fallback = makeEngine('fallback', () => Promise.resolve(ok('en', 'fallback')));
    const result = await detectLanguageFromTextWith([abstain, fallback], 'text');
    expect(result?.engine).toBe('fallback');
  });

  it('returns null when every engine abstains', async () => {
    const a = makeEngine('a', () => Promise.resolve(null));
    const b = makeEngine('b', () => Promise.resolve(null));
    const result = await detectLanguageFromTextWith([a, b], 'text');
    expect(result).toBeNull();
  });

  it('does not propagate errors out of the orchestrator', async () => {
    const broken = makeEngine('broken', () => Promise.reject(new Error('boom')));
    await expect(detectLanguageFromTextWith([broken], 'text')).resolves.toBeNull();
  });

  it('passes the AbortSignal from DetectContext to engines', async () => {
    const ctrl = new AbortController();
    const captured: (AbortSignal | undefined)[] = [];
    const recorder = makeEngine('recorder', (_text: string, ctx: DetectContext) => {
      captured.push(ctx.signal);
      return Promise.resolve(null);
    });
    await detectLanguageFromTextWith([recorder], 'text', { signal: ctrl.signal });
    expect(captured[0]).toBe(ctrl.signal);
  });

  it('forwards maxChars from DetectContext to engines', async () => {
    const captured: (number | undefined)[] = [];
    const recorder = makeEngine('recorder', (_text: string, ctx: DetectContext) => {
      captured.push(ctx.maxChars);
      return Promise.resolve(null);
    });
    await detectLanguageFromTextWith([recorder], 'text', { maxChars: 500 });
    expect(captured[0]).toBe(500);
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
