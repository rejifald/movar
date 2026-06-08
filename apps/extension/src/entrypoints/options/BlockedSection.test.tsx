import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { messagesUk } from '../../lib/i18n/messages-uk';
import { I18nProvider } from '../../lib/i18n';
import { displayLanguage } from './shared';
import { BlockedSection } from './BlockedSection';

beforeEach(() => {
  // I18nProvider eagerly evaluates browser.i18n.getUILanguage() as a call
  // argument (even for an explicit 'uk' setting), and the fake browser leaves
  // it unimplemented — stub it so the provider-wrapped case can render.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en-US');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const t = messagesEn.options.blocked;

function withBlocked(blocked: MovarSettings['blocked']): MovarSettings {
  return { ...defaultSettings, blocked };
}

// Default (no provider) renders in English, so language names come out via the
// 'en' locale used by the chip's aria-labels.
const enName = (code: string): string => displayLanguage(code, 'en');

describe('BlockedSection', () => {
  it('renders one chip per blocked language', () => {
    render(<BlockedSection settings={withBlocked(['ru', 'de'])} onChange={vi.fn()} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('shows the empty-state copy when nothing is blocked', () => {
    render(<BlockedSection settings={withBlocked([])} onChange={vi.fn()} />);
    expect(screen.getByText(t.empty)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('locks Russian: a lock hint is shown and there is no unblock button for it', () => {
    render(<BlockedSection settings={withBlocked(['ru'])} onChange={vi.fn()} />);
    // The lock indicator carries the locked-hint aria-label…
    expect(screen.getByLabelText(t.lockedHint(enName('ru')))).toBeTruthy();
    // …and crucially there is NO unblock button for the locked code.
    expect(screen.queryByRole('button', { name: t.unblock(enName('ru')) })).toBeNull();
  });

  it('unblocks a non-locked language, persisting the filtered list', async () => {
    const onChange = vi.fn();
    render(<BlockedSection settings={withBlocked(['ru', 'de'])} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: t.unblock(enName('de')) }));
    expect(onChange).toHaveBeenCalledTimes(1);
    // Russian survives the filter; German is gone.
    expect(onChange.mock.calls[0]![0].blocked).toEqual(['ru']);
  });

  it('omits already-blocked and locked codes from the add picker', () => {
    render(<BlockedSection settings={withBlocked(['ru', 'de'])} onChange={vi.fn()} />);
    // 'de' is already blocked → not offered; 'ru' is locked → never offered.
    expect(screen.queryByRole('option', { name: `${enName('de')} (de)` })).toBeNull();
    expect(screen.queryByRole('option', { name: `${enName('ru')} (ru)` })).toBeNull();
    // A still-addable language is present.
    expect(screen.getByRole('option', { name: `${enName('fr')} (fr)` })).toBeTruthy();
  });

  it('adds a language picked from the add picker', async () => {
    const onChange = vi.fn();
    render(<BlockedSection settings={withBlocked(['ru'])} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t.addLabel }), 'fr');
    await userEvent.click(screen.getByRole('button', { name: t.addLabel }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].blocked).toEqual(['ru', 'fr']);
  });

  it('hides the add picker once every supported language is blocked', () => {
    // Every supported, non-locked language is blocked → addable is empty → no picker.
    render(
      <BlockedSection
        settings={withBlocked(['uk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'ru'])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: t.addLabel })).toBeNull();
  });

  it('renders chips and lock hint in Ukrainian under the uk provider', () => {
    const uk = messagesUk.options.blocked;
    render(
      <I18nProvider uiLanguage="uk">
        <BlockedSection settings={withBlocked(['ru'])} onChange={vi.fn()} />
      </I18nProvider>,
    );
    // Title proves the provider's catalogue is in effect; lock hint uses the uk name.
    expect(screen.getByText(uk.title)).toBeTruthy();
    const ukName = displayLanguage('ru', 'uk');
    expect(screen.getByLabelText(uk.lockedHint(ukName))).toBeTruthy();
  });
});
