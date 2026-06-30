import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the detector so each test drives a deterministic verdict — the unit
// under test is the verdict→label/dot MAPPING (+ the empty/unavailable
// branches), not langtell's corpus classification (that's covered in
// @movar/lang-detect's own suite). `detectCyrillicLanguage` is the only export
// this tab uses.
interface Verdict {
  language: 'uk' | 'ru' | 'be' | 'bg' | 'unknown';
  ukScore: number;
  ruScore: number;
}
const detect = vi.fn<(text: string) => Verdict>();
vi.mock('@movar/lang-detect', () => ({
  detectCyrillicLanguage: (text: string): Verdict => detect(text),
}));

import { DetectorTab, computeVerdict } from './DetectorTab';
import { messagesEn } from '../i18n/messages-en';

afterEach(() => {
  cleanup();
  detect.mockReset();
});

/** A predictable endonym resolver so label assertions don't depend on the
 *  runtime's `Intl.DisplayNames` data. */
const display = (code: 'uk' | 'ru' | 'be' | 'bg'): string =>
  ({ uk: 'ukrainian', ru: 'russian', be: 'belarusian', bg: 'bulgarian' })[code];

describe('computeVerdict — verdict→label/dot mapping', () => {
  it('returns null for empty input (result hidden)', () => {
    expect(computeVerdict('', messagesEn, display)).toBeNull();
  });

  it('returns null for whitespace-only input (result hidden)', () => {
    expect(computeVerdict('   \n\t ', messagesEn, display)).toBeNull();
    // Whitespace short-circuits before the detector is ever consulted.
    expect(detect).not.toHaveBeenCalled();
  });

  it('maps Ukrainian → is-uk + capitalised endonym', () => {
    detect.mockReturnValue({ language: 'uk', ukScore: 3, ruScore: 0 });
    expect(computeVerdict('щось українською', messagesEn, display)).toEqual({
      dotClass: 'is-uk',
      label: 'Ukrainian',
    });
  });

  it('maps Russian → is-ru + capitalised endonym', () => {
    detect.mockReturnValue({ language: 'ru', ukScore: 0, ruScore: 3 });
    expect(computeVerdict('что-то по-русски', messagesEn, display)).toEqual({
      dotClass: 'is-ru',
      label: 'Russian',
    });
  });

  it('maps the other Cyrillic languages (be/bg) → is-other', () => {
    detect.mockReturnValue({ language: 'be', ukScore: 0, ruScore: 0 });
    expect(computeVerdict('нешта', messagesEn, display)).toMatchObject({ dotClass: 'is-other' });
    detect.mockReturnValue({ language: 'bg', ukScore: 0, ruScore: 0 });
    expect(computeVerdict('нещо', messagesEn, display)).toMatchObject({ dotClass: 'is-other' });
  });

  it('maps unknown → is-unknown + the "no Cyrillic" host string', () => {
    detect.mockReturnValue({ language: 'unknown', ukScore: 0, ruScore: 0 });
    expect(computeVerdict('latin text', messagesEn, display)).toEqual({
      dotClass: 'is-unknown',
      label: messagesEn.detector.notDetected,
    });
  });

  it('falls back to the "unavailable" string when the detector throws', () => {
    detect.mockImplementation(() => {
      throw new Error('detector exploded');
    });
    expect(computeVerdict('any text', messagesEn, display)).toEqual({
      dotClass: 'is-unknown',
      label: messagesEn.detector.unavailable,
    });
  });
});

describe('DetectorTab — rendering + interaction', () => {
  it('renders the card copy (title / intro / actions / note), result hidden', () => {
    render(<DetectorTab messages={messagesEn} />);
    expect(screen.getByText(messagesEn.detector.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.intro)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.detector.detect })).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.detector.clear })).toBeTruthy();
    expect(screen.getByText(messagesEn.detector.note)).toBeTruthy();
    // The <output> starts hidden (empty input).
    expect(screen.getByRole('status', { hidden: true }).hidden).toBe(true);
  });

  it('shows a verdict with the right dot class after typing + Detect', () => {
    detect.mockReturnValue({ language: 'uk', ukScore: 3, ruScore: 0 });
    render(<DetectorTab messages={messagesEn} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'привіт' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.detector.detect }));

    const result = screen.getByRole('status');
    expect(result.hidden).toBe(false);
    expect(result.className).toContain('is-uk');
    expect(result.textContent).toContain('Ukrainian');
    expect(result.querySelector('.result-dot')).toBeTruthy();
  });

  it('debounces input by 150ms, then renders the verdict without a click', () => {
    vi.useFakeTimers();
    try {
      detect.mockReturnValue({ language: 'ru', ukScore: 0, ruScore: 3 });
      render(<DetectorTab messages={messagesEn} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'это' } });

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

  it('Clear empties the input and hides the result', () => {
    detect.mockReturnValue({ language: 'uk', ukScore: 3, ruScore: 0 });
    render(<DetectorTab messages={messagesEn} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'привіт' } });
    fireEvent.click(screen.getByRole('button', { name: messagesEn.detector.detect }));
    expect(screen.getByRole('status').hidden).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: messagesEn.detector.clear }));
    expect((input as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('status', { hidden: true }).hidden).toBe(true);
  });
});
