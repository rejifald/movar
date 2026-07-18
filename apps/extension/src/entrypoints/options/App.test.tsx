import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn, messagesUk } from '@movar/i18n';
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
  it('mounts the visible option sections', async () => {
    await seed({});
    render(<App />);
    // Each section renders its heading; waitFor lets the async load settle.
    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.priority.title)).toBeTruthy();
    });
    expect(screen.getByText(messagesEn.options.pageContent.title)).toBeTruthy();
    // The exempt-site (allowlist) editor is now part of the options page (#90).
    expect(screen.getByText(messagesEn.options.allowlist.title)).toBeTruthy();
  });

  it('mounts the exempt-site editor with its stored entries; keeps the blocked-language editor hidden', async () => {
    await seed({ blocked: ['ru', 'de'], allowlist: ['example.com'] });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.priority.title)).toBeTruthy();
    });

    // Exempt-site editor is mounted: its heading + a remove control for the
    // stored entry are both present.
    expect(screen.getByText(messagesEn.options.allowlist.title)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: messagesEn.options.allowlist.remove('example.com') }),
    ).toBeTruthy();

    // The blocked-language editor stays hidden — that's #89's scope, not this.
    expect(screen.queryByText(messagesEn.options.blocked.title)).toBeNull();
  });

  it('adds an exempt domain from the options form, persisting the canonical value', async () => {
    await seed({ allowlist: [] });
    render(<App />);
    const input = await screen.findByLabelText(messagesEn.options.allowlist.inputLabel);
    // A pasted URL with scheme/www/path is normalised to the bare domain both by
    // the form and again at the settings boundary — one canonical entry lands.
    await userEvent.type(input, 'https://www.Example.com/path');
    await userEvent.click(
      screen.getByRole('button', { name: messagesEn.options.allowlist.addButton }),
    );
    await waitFor(async () => {
      const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
        SETTINGS_KEY
      ] as MovarSettings;
      expect(stored.allowlist).toEqual(['example.com']);
    });
  });

  it('removes a stored exempt domain from the options form', async () => {
    await seed({ allowlist: ['example.com', 'keep.org'] });
    render(<App />);
    const removeBtn = await screen.findByRole('button', {
      name: messagesEn.options.allowlist.remove('example.com'),
    });
    await userEvent.click(removeBtn);
    await waitFor(async () => {
      const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[
        SETTINGS_KEY
      ] as MovarSettings;
      expect(stored.allowlist).toEqual(['keep.org']);
    });
  });

  it('renders the loaded priority order', async () => {
    await seed({ priority: ['en', 'uk'], allowlist: ['example.com'] });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.priority.title)).toBeTruthy();
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
      expect(screen.getByRole<HTMLInputElement>('switch').checked).toBe(true);
    });
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
});
