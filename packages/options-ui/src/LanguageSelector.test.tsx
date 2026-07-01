import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from '@movar/i18n';
import { LanguageSelector } from './LanguageSelector';

const t = messagesEn.languageSelector;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LanguageSelector', () => {
  it('renders a named select reflecting the current value', () => {
    render(<LanguageSelector value="en" onChange={vi.fn()} browserUiLanguage="en-US" />);
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: t.label });
    expect(select.value).toBe('en');
  });

  it('labels the auto option with the resolved browser language', () => {
    render(<LanguageSelector value="auto" onChange={vi.fn()} browserUiLanguage="en-US" />);
    // browserUiLanguage 'en-US' resolves to English, so the auto label reads
    // "Auto (English)". The explicit options carry their catalogue names.
    expect(screen.getByRole('option', { name: `${t.auto} (${t.en})` })).toBeTruthy();
    expect(screen.getByRole('option', { name: t.en })).toBeTruthy();
    expect(screen.getByRole('option', { name: t.uk })).toBeTruthy();
  });

  it('resolves the auto label to Ukrainian when the browser UI is Ukrainian', () => {
    render(<LanguageSelector value="auto" onChange={vi.fn()} browserUiLanguage="uk" />);
    expect(screen.getByRole('option', { name: `${t.auto} (${t.uk})` })).toBeTruthy();
  });

  it('calls onChange with the picked UI language', async () => {
    const onChange = vi.fn();
    render(<LanguageSelector value="auto" onChange={onChange} browserUiLanguage="en-US" />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t.label }), 'uk');
    expect(onChange).toHaveBeenCalledWith('uk');
  });
});
