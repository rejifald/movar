import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SnippetVerdict } from '@movar/lang-detect';

// Mock ONLY the classifier seam so each mapping test drives a deterministic
// verdict — the unit under test is the verdict → class / badge / label MAPPING
// (+ the empty / unavailable branches), not langtell's corpus classification
// (covered in @movar/lang-detect's own suite). `PROFILES` and the franc resolver
// stay REAL (spread from the original module), so `gatherClues` computes real
// evidence; only `classifyBySnippet`'s verdict is controlled.
const { classify } = vi.hoisted(() => ({
  classify: vi.fn<(text: string, ...rest: unknown[]) => SnippetVerdict>(),
}));
vi.mock('@movar/lang-detect', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    classifyBySnippet: (text: string, ...rest: unknown[]): SnippetVerdict =>
      classify(text, ...rest),
  };
});

import { DetectorTab, computeResult, gatherClues } from './DetectorTab';
import { messagesEn } from '../i18n/messages-en';

afterEach(() => {
  cleanup();
  classify.mockReset();
});

/** A `SnippetVerdict` with `unknown` defaults, overridden per test. */
const verdict = (over: Partial<SnippetVerdict>): SnippetVerdict => ({
  language: 'unknown',
  margin: 0,
  rung: null,
  discriminating: false,
  ...over,
});

/** A predictable endonym resolver so label assertions don't depend on the
 *  runtime's `Intl.DisplayNames` data. */
const display = (code: string): string =>
  ({ uk: 'ukrainian', ru: 'russian', be: 'belarusian' })[code] ?? code;

describe('computeResult — verdict → class / badge / label mapping', () => {
  it('returns null for empty / whitespace input (result hidden, detector not consulted)', () => {
    expect(computeResult('', messagesEn, display)).toBeNull();
    expect(computeResult('   \n\t ', messagesEn, display)).toBeNull();
    expect(classify).not.toHaveBeenCalled();
  });

  it('maps Ukrainian → is-uk / is-accent / check + capitalised endonym + rung key', () => {
    classify.mockReturnValue(verdict({ language: 'uk', rung: 1, margin: 2 }));
    expect(computeResult('текст', messagesEn, display)).toMatchObject({
      rootClass: 'is-uk',
      tone: 'is-accent',
      icon: 'check',
      verdict: 'Ukrainian',
      code: 'uk',
      rung: '1',
    });
  });

  it('maps Russian → is-ru / is-danger', () => {
    classify.mockReturnValue(verdict({ language: 'ru', rung: '2a' }));
    expect(computeResult('текст', messagesEn, display)).toMatchObject({
      rootClass: 'is-ru',
      tone: 'is-danger',
      code: 'ru',
      verdict: 'Russian',
      rung: '2a',
    });
  });

  it('maps Belarusian → is-be with the neutral badge (no tint)', () => {
    classify.mockReturnValue(verdict({ language: 'be', rung: '2b' }));
    expect(computeResult('текст', messagesEn, display)).toMatchObject({
      rootClass: 'is-be',
      tone: '',
      code: 'be',
      verdict: 'Belarusian',
      rung: '2b',
    });
  });

  it('maps unknown WITH evidence → is-unknown + the "mixed signals" string', () => {
    classify.mockReturnValue(verdict({ language: 'unknown' }));
    // Cyrillic text carries distinctive letters → there IS evidence, so the
    // verdict reads "mixed signals", not "no Cyrillic language".
    const result = computeResult('і ї є щось', messagesEn, display);
    expect(result?.rootClass).toBe('is-unknown');
    expect(result?.code).toBeNull();
    expect(result?.verdict).toBe(messagesEn.detector.ambiguous);
    expect(result?.clues.length).toBeGreaterThan(0);
  });

  it('maps unknown WITHOUT evidence → the "no Cyrillic language" string', () => {
    classify.mockReturnValue(verdict({ language: 'unknown' }));
    const result = computeResult('latin only text', messagesEn, display);
    expect(result?.verdict).toBe(messagesEn.detector.notDetected);
    expect(result?.clues).toEqual([]);
  });

  it('falls back to the "unavailable" string when the classifier throws', () => {
    classify.mockImplementation(() => {
      throw new Error('classifier exploded');
    });
    expect(computeResult('текст', messagesEn, display)).toMatchObject({
      icon: 'info',
      verdict: messagesEn.detector.unavailable,
      code: null,
      clues: [],
    });
  });
});

describe('gatherClues — per-language evidence (real PROFILES)', () => {
  it('finds a language’s distinctive letters and keeps it in the report', () => {
    const clues = gatherClues('Слово з літерами і, ї, є та ґ.');
    const uk = clues.find((clue) => clue.code === 'uk');
    expect(uk).toBeTruthy();
    expect(uk?.letters).toEqual(expect.arrayContaining(['ї', 'є']));
  });

  it('drops languages with no evidence (Latin text → no clues)', () => {
    expect(gatherClues('the quick brown fox')).toEqual([]);
  });
});

describe('DetectorTab — rendering + interaction', () => {
  it('renders the detector copy + How-it-works / Limitations, result hidden', () => {
    render(<DetectorTab messages={messagesEn} />);
    expect(screen.getByText(messagesEn.detector.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.intro)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.detector.detect })).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.howItWorks.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.limitations.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.limitations.items[0]!)).toBeTruthy();
    // The <output> starts hidden (empty input).
    expect(screen.getByRole('status', { hidden: true }).hidden).toBe(true);
  });

  it('shows the verdict head + evidence report after typing + Detect', () => {
    classify.mockReturnValue(verdict({ language: 'uk', rung: 1, margin: 2 }));
    render(<DetectorTab messages={messagesEn} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'і ї є щось українською' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.detector.detect }));

    const result = screen.getByRole('status');
    expect(result.hidden).toBe(false);
    expect(result.className).toContain('is-uk');
    // The language name comes from the real @movar/i18n resolver (en locale).
    expect(result.textContent).toContain('Ukrainian');
    // The evidence report + the verdict's highlighted clue block.
    expect(within(result).getByText(messagesEn.detector.evidence)).toBeTruthy();
    expect(result.querySelector('.clue-lang.is-detected')).toBeTruthy();
    // "Matched by <layer>" names the deciding rung.
    expect(result.querySelector('.result-method-layer')?.textContent).toBe(
      messagesEn.detector.matched['1'],
    );
  });

  it('debounces input by 150ms, then renders the verdict without a click', () => {
    vi.useFakeTimers();
    try {
      classify.mockReturnValue(verdict({ language: 'ru', rung: '2a' }));
      render(<DetectorTab messages={messagesEn} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'это русский' } });

      // Before the debounce elapses the result is still hidden.
      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(screen.getByRole('status', { hidden: true }).hidden).toBe(true);

      // After 150ms the debounced render fires.
      act(() => {
        vi.advanceTimersByTime(20);
      });
      const result = screen.getByRole('status');
      expect(result.hidden).toBe(false);
      expect(result.className).toContain('is-ru');
    } finally {
      vi.useRealTimers();
    }
  });
});
