import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn, messagesUk } from '@movar/i18n';
import { PopupCrashFallback } from './CrashFallback';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('lang');
});

describe('PopupCrashFallback', () => {
  it('renders the StatusHeader crash hero with the English copy by default', () => {
    render(<PopupCrashFallback />);

    expect(screen.getByText(messagesEn.errorBoundary.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.errorBoundary.description)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.errorBoundary.reload })).toBeTruthy();
    // The brand bar identifies the crashed surface as Movar.
    expect(screen.getAllByText('Movar').length).toBeGreaterThan(0);
  });

  it('picks the Ukrainian copy when the document lang is uk', () => {
    document.documentElement.lang = 'uk';
    render(<PopupCrashFallback />);

    expect(screen.getByText(messagesUk.errorBoundary.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesUk.errorBoundary.reload })).toBeTruthy();
  });

  it('reloads the popup when the crash hero reload button is clicked', async () => {
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable and throws when called, so it
    // can't be spied directly — mock the `location` getter to hand back a
    // stand-in whose reload is observable (mirrors error-boundary.test).
    const realLocation = globalThis.location as unknown as Record<string, unknown>;
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      ...realLocation,
      reload,
    } as unknown as Location);

    render(<PopupCrashFallback />);
    await userEvent.click(screen.getByRole('button', { name: messagesEn.errorBoundary.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
