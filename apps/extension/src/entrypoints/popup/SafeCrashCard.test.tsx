import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn, messagesUk } from '@movar/i18n';
import { SafeCrashCard } from './SafeCrashCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('lang');
});

describe('SafeCrashCard', () => {
  it('renders the crash card (brand bar + hero + reload) with the English copy by default', () => {
    render(<SafeCrashCard />);

    // Brand bar identifies the crashed surface as Movar (span + BrandMark title).
    expect(screen.getAllByText('Movar').length).toBeGreaterThan(0);
    expect(screen.getByText(messagesEn.errorBoundary.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.errorBoundary.description)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.errorBoundary.reload })).toBeTruthy();
    // Announced to assistive tech, like the minimal panel it replaces.
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('picks the Ukrainian copy when the document lang is uk', () => {
    document.documentElement.lang = 'uk';
    render(<SafeCrashCard />);

    expect(screen.getByText(messagesUk.errorBoundary.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesUk.errorBoundary.reload })).toBeTruthy();
  });

  it('reloads the popup when the reload button is clicked', async () => {
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable; mock the location getter to
    // hand back a stand-in whose reload is observable (see error-boundary.test).
    const realLocation = globalThis.location as unknown as Record<string, unknown>;
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      ...realLocation,
      reload,
    } as unknown as Location);

    render(<SafeCrashCard />);
    await userEvent.click(screen.getByRole('button', { name: messagesEn.errorBoundary.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
