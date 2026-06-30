import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  I18nProvider,
  makeLanguageDisplay,
  resolveLocale,
  uiLanguageFromPriority,
  useI18n,
} from './index';
import { messagesEn } from './messages-en';
import { messagesUk } from './messages-uk';

afterEach(cleanup);

/** Probe component that surfaces the resolved locale and a representative
 *  string from the active catalogue, so the assertion can prove WHICH
 *  catalogue `useI18n` handed back under a given provider. */
function Probe() {
  const { locale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="off-title">{t.offTitle}</span>
    </div>
  );
}

describe('I18nProvider + useI18n', () => {
  it("serves the Ukrainian catalogue for an explicit 'uk' preference", () => {
    // Browser UI is English, but the explicit override wins — proves the
    // provider resolves via resolveLocale and indexes CATALOGUES.uk.
    render(
      <I18nProvider uiLanguage="uk" browserUiLanguage="en-US">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('uk');
    expect(screen.getByTestId('off-title').textContent).toBe(messagesUk.offTitle);
  });

  it("serves the English catalogue for an explicit 'en' preference", () => {
    render(
      <I18nProvider uiLanguage="en" browserUiLanguage="uk-UA">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('off-title').textContent).toBe(messagesEn.offTitle);
  });

  it("resolves 'auto' to uk on a Ukrainian browser", () => {
    render(
      <I18nProvider uiLanguage="auto" browserUiLanguage="uk">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('uk');
    expect(screen.getByTestId('off-title').textContent).toBe(messagesUk.offTitle);
  });

  it("resolves 'auto' to en on a non-Ukrainian browser", () => {
    render(
      <I18nProvider uiLanguage="auto" browserUiLanguage="de-DE">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('off-title').textContent).toBe(messagesEn.offTitle);
  });

  it('defaults to English with no provider (createContext default value)', () => {
    // useI18n outside any provider falls back to the context default — the
    // guarantee that a miswired mount still renders readable copy.
    render(<Probe />);
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('off-title').textContent).toBe(messagesEn.offTitle);
  });
});

describe('I18nProvider — document lang reflection (WCAG 3.1.1)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
  });

  it("sets <html lang='uk'> for a Ukrainian user", () => {
    render(
      <I18nProvider uiLanguage="uk" browserUiLanguage="en-US">
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('uk');
  });

  it("sets <html lang='en'> for an English user", () => {
    render(
      <I18nProvider uiLanguage="en" browserUiLanguage="uk-UA">
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
  });

  it('follows a changing preference (auto → uk browser)', () => {
    render(
      <I18nProvider uiLanguage="auto" browserUiLanguage="uk">
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('uk');
  });
});

describe('i18n barrel re-exports', () => {
  // index.tsx re-exports resolveLocale, uiLanguageFromPriority (from resolve)
  // and makeLanguageDisplay (from display-names). A smoke test pins that the
  // barrel surface stays wired — a missing re-export would break popup imports.
  it('re-exports resolveLocale', () => {
    expect(resolveLocale('uk', 'en-US')).toBe('uk');
  });

  it('re-exports uiLanguageFromPriority', () => {
    expect(uiLanguageFromPriority(['uk', 'en'])).toBe('uk');
  });

  it('re-exports makeLanguageDisplay', () => {
    expect(typeof makeLanguageDisplay('en')).toBe('function');
    expect(makeLanguageDisplay('en')('uk')).toBe('Ukrainian');
  });
});
