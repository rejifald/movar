import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import { messagesEn } from '@movar/i18n';
import { App, resolveAccessCopy, resolveStepCopy } from './App';

// Under WxtVitest the build target defaults to 'chrome', so the App resolves the
// Chromium flow — the case these tests cover.
const o = messagesEn.onboarding;

/** Seed English UI (priority en-first) so the onboarding renders against the EN
 *  catalogue; the default priority is uk-first, which would flip it to UK. */
async function seedEnglish() {
  await fakeBrowser.storage.sync.set({
    settings: { ...defaultSettings, priority: ['en', 'uk'] },
  });
}

beforeEach(() => {
  fakeBrowser.reset();
  // I18nProvider resolves 'auto' via getUILanguage(), which the fake leaves
  // unimplemented (throws) — pin it to a deterministic English value.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en-US');
  // Host access held by default → the access step shows the "granted" line.
  (browser as unknown as { permissions: { contains: () => Promise<boolean> } }).permissions = {
    contains: vi.fn().mockResolvedValue(true),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('onboarding App (chromium build)', () => {
  it('renders the chromium flow steps and omits the Safari-only enable step', async () => {
    await seedEnglish();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: o.title })).toBeTruthy();
    });
    expect(screen.getByText(o.steps.pin.title)).toBeTruthy();
    expect(screen.getByText(o.access.chromium.title)).toBeTruthy();
    expect(screen.getByText(o.steps.reload.title)).toBeTruthy();
    expect(screen.getByText(o.steps.language.title)).toBeTruthy();
    // Enable is Safari-only; it must not appear on the Chromium flow.
    expect(screen.queryByText(o.enable.safari.title)).toBeNull();
  });

  it('shows the granted permission line when host access is held', async () => {
    await seedEnglish();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(o.permission.granted)).toBeTruthy();
    });
  });

  it('opens the options page from the language-step CTA', async () => {
    const openOptionsPage = vi.fn();
    (browser.runtime as unknown as { openOptionsPage: typeof openOptionsPage }).openOptionsPage =
      openOptionsPage;
    await seedEnglish();
    render(<App />);

    const cta = await screen.findByRole('button', { name: o.steps.language.cta });
    await userEvent.click(cta);

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('shows the missing-permission line and rechecks when host access is not held', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    (browser as unknown as { permissions: { contains: typeof contains } }).permissions = {
      contains,
    };
    await seedEnglish();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(o.permission.missing)).toBeTruthy();
    });
    await userEvent.click(screen.getByRole('button', { name: o.permission.recheck }));
    expect(contains).toHaveBeenCalled();
  });

  it('shows an Allow-access button that requests host permission when missing', async () => {
    const contains = vi.fn().mockResolvedValue(false);
    const request = vi.fn().mockResolvedValue(true);
    (
      browser as unknown as {
        permissions: { contains: typeof contains; request: typeof request };
      }
    ).permissions = { contains, request };
    await seedEnglish();
    render(<App />);

    const allow = await screen.findByRole('button', { name: o.permission.button });
    await userEvent.click(allow);

    expect(request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
  });
});

describe('resolveStepCopy / resolveAccessCopy', () => {
  it('resolves the access step copy for every flow', () => {
    for (const flow of ['chromium', 'firefox', 'safari', 'safari-ios'] as const) {
      const copy = resolveAccessCopy(o, flow, 'Chrome');
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });

  it('resolves the enable step for Safari flows and the shared steps elsewhere', () => {
    expect(resolveStepCopy(messagesEn, 'safari', 'enable', 'Chrome').title).toBe(
      o.enable.safari.title,
    );
    expect(resolveStepCopy(messagesEn, 'safari-ios', 'enable', 'Chrome').title).toBe(
      o.enable.safariIos.title,
    );
    expect(resolveStepCopy(messagesEn, 'chromium', 'pin', 'Edge').body).toContain('Edge');
    expect(resolveStepCopy(messagesEn, 'chromium', 'reload', 'Edge').title).toBe(
      o.steps.reload.title,
    );
    expect(resolveStepCopy(messagesEn, 'chromium', 'language', 'Edge').title).toBe(
      o.steps.language.title,
    );
    expect(resolveStepCopy(messagesEn, 'firefox', 'access', 'Edge').title).toBe(
      o.access.firefox.title,
    );
  });
});
