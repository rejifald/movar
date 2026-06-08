import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { messagesUk } from '../../lib/i18n/messages-uk';
import { App } from './App';

const SETTINGS_KEY = 'settings';

beforeEach(() => {
  fakeBrowser.reset();
  // The I18nProvider resolves 'auto' via browser.i18n.getUILanguage(), which the
  // fake browser leaves unimplemented (it throws). App's *initial* state is the
  // defaults (uiLanguage: 'auto'), so the very first render reaches it before the
  // load effect swaps in stored settings — stub it to a deterministic value.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en-US');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function seed(settings: Partial<MovarSettings>): Promise<void> {
  await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: { ...defaultSettings, ...settings } });
}

describe('options App', () => {
  it('mounts all four option sections', async () => {
    await seed({});
    render(<App />);
    // Each section renders its heading; waitFor lets the async load settle.
    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.priority.title)).toBeTruthy();
    });
    expect(screen.getByText(messagesEn.options.blocked.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.options.allowlist.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.options.pageContent.title)).toBeTruthy();
  });

  it('renders the loaded settings (priority order, allowlist entries)', async () => {
    await seed({ priority: ['en', 'uk'], allowlist: ['example.com'] });
    render(<App />);

    await waitFor(() => {
      // Allowlist chip proves the stored value reached the section.
      expect(
        screen.getByRole('button', { name: messagesEn.options.allowlist.remove('example.com') }),
      ).toBeTruthy();
    });

    // Priority list reflects the stored order: English first, Ukrainian second.
    const [priorityList] = screen.getAllByRole('list');
    const rowText = within(priorityList!)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rowText[0]).toContain('English');
    expect(rowText[1]).toContain('Ukrainian');
  });

  it('renders the contentModification toggle as checked when stored on', async () => {
    await seed({ contentModification: true });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true);
    });
  });

  it('persists an edit (adding an allowlist domain) back to sync storage', async () => {
    await seed({ allowlist: [] });
    render(<App />);

    const input = await screen.findByRole('textbox', {
      name: messagesEn.options.allowlist.inputLabel,
    });
    await userEvent.type(input, 'example.com');
    await userEvent.click(
      screen.getByRole('button', { name: messagesEn.options.allowlist.addButton }),
    );

    await waitFor(async () => {
      const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
        SETTINGS_KEY
      ] as MovarSettings;
      expect(stored.allowlist).toEqual(['example.com']);
    });
    // The new chip is also reflected in the rendered list.
    expect(
      screen.getByRole('button', { name: messagesEn.options.allowlist.remove('example.com') }),
    ).toBeTruthy();
  });

  it('changes the UI language from the footer picker, persisting uiLanguage', async () => {
    await seed({ uiLanguage: 'en' });
    render(<App />);
    // The footer language picker is labelled from the catalogue.
    const picker = await screen.findByRole('combobox', {
      name: messagesEn.languageSelector.label,
    });
    await userEvent.selectOptions(picker, 'uk');
    await waitFor(async () => {
      const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
        SETTINGS_KEY
      ] as MovarSettings;
      expect(stored.uiLanguage).toBe('uk');
    });
    // The page now renders in Ukrainian — the priority heading flips catalogue.
    expect(screen.getByText(messagesUk.options.priority.title)).toBeTruthy();
  });

  it('re-asserts the locked-language invariant on load (Russian stays blocked)', async () => {
    // A tampered stored value with Russian missing from blocked: getSettings()
    // enforces the invariant, so the Blocked section must still show its lock.
    await seed({ blocked: [], priority: ['uk', 'en'] });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.blocked.title)).toBeTruthy();
    });
    // The locked Russian hint is present even though storage omitted it.
    expect(screen.getByLabelText(messagesEn.options.blocked.lockedHint('Russian'))).toBeTruthy();
  });
});
