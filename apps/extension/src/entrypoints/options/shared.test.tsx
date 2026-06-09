import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DOMAIN_PATTERN, SUPPORTED_LANGUAGES, displayLanguage, normaliseDomain } from './shared';
import { AddLanguagePicker } from './shared';

afterEach(cleanup);

describe('SUPPORTED_LANGUAGES', () => {
  it('lists the documented preferred-language catalogue, Russian last', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['uk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'ru']);
  });
});

describe('displayLanguage', () => {
  it('renders the language name in the requested UI locale', () => {
    expect(displayLanguage('uk', 'en')).toBe('Ukrainian');
    expect(displayLanguage('de', 'en')).toBe('German');
  });

  it('renders the endonym when the locale equals the code', () => {
    // BlockedItem renders the language in its own language — Ukrainian for 'uk'.
    expect(displayLanguage('uk', 'uk')).toBe('українська');
  });

  it('falls back to the bare code when Intl rejects the locale', () => {
    // An invalid BCP-47 locale tag makes the Intl.DisplayNames constructor throw;
    // the catch returns the code unchanged.
    expect(displayLanguage('uk', 'not a locale!!')).toBe('uk');
  });

  it('uses the runtime default locale when none is passed', () => {
    // No locale arg → undefined locales → still resolves to *some* name, never throws.
    expect(displayLanguage('uk')).toBeTruthy();
  });

  it('treats an empty-string locale like "no locale" (runtime default)', () => {
    // The `locale != null && locale !== ''` guard sends '' down the undefined-locales
    // path rather than passing [''] to Intl.
    expect(displayLanguage('uk', '')).toBeTruthy();
  });
});

describe('normaliseDomain', () => {
  it('lowercases and trims surrounding whitespace', () => {
    expect(normaliseDomain('  Example.COM  ')).toBe('example.com');
  });

  it('strips the http/https scheme', () => {
    expect(normaliseDomain('https://example.com')).toBe('example.com');
    expect(normaliseDomain('http://example.com')).toBe('example.com');
  });

  it('strips a leading www.', () => {
    expect(normaliseDomain('www.example.com')).toBe('example.com');
  });

  it('drops the path, leaving just the host', () => {
    expect(normaliseDomain('https://www.example.com/some/path?q=1')).toBe('example.com');
  });

  it('drops an explicit port', () => {
    expect(normaliseDomain('example.com:8080')).toBe('example.com');
  });
});

describe('DOMAIN_PATTERN', () => {
  it('accepts dotted hostnames', () => {
    expect(DOMAIN_PATTERN.test('example.com')).toBe(true);
    expect(DOMAIN_PATTERN.test('sub.example.co.uk')).toBe(true);
  });

  it('rejects a bare label with no dot', () => {
    expect(DOMAIN_PATTERN.test('localhost')).toBe(false);
  });

  it('rejects leading/trailing hyphens and empty input', () => {
    expect(DOMAIN_PATTERN.test('-example.com')).toBe(false);
    expect(DOMAIN_PATTERN.test('example-.com')).toBe(false);
    expect(DOMAIN_PATTERN.test('')).toBe(false);
  });
});

describe('AddLanguagePicker', () => {
  const options = ['uk', 'en'] as const;

  it('renders a labelled select and a disabled Add button while no language is picked', () => {
    render(<AddLanguagePicker label="Add language" options={options} onAdd={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Add language' })).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add language' }).disabled).toBe(
      true,
    );
  });

  it('lists each option as "<English name> (<code>)"', () => {
    render(<AddLanguagePicker label="Add language" options={options} onAdd={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Ukrainian (uk)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'English (en)' })).toBeTruthy();
  });

  it('enables Add once a language is chosen and calls onAdd with the code', async () => {
    const onAdd = vi.fn();
    render(<AddLanguagePicker label="Add language" options={options} onAdd={onAdd} />);
    const select = screen.getByRole('combobox', { name: 'Add language' });
    const addButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Add language' });

    await userEvent.selectOptions(select, 'uk');
    expect(addButton.disabled).toBe(false);

    await userEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledWith('uk');
  });

  it('resets the draft after a successful add (Add disabled again)', async () => {
    render(<AddLanguagePicker label="Add language" options={options} onAdd={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Add language' });
    const addButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Add language' });

    await userEvent.selectOptions(select, 'en');
    await userEvent.click(addButton);

    expect(addButton.disabled).toBe(true);
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('does not call onAdd when Add is activated with no selection', async () => {
    const onAdd = vi.fn();
    render(<AddLanguagePicker label="Add language" options={options} onAdd={onAdd} />);
    // The button is disabled, so a click is a no-op; handleAdd also guards on empty draft.
    await userEvent.click(screen.getByRole('button', { name: 'Add language' }));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
