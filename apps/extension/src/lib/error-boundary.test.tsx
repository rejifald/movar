import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from './i18n/messages-en';
import { messagesUk } from './i18n/messages-uk';
import { ErrorBoundary } from './error-boundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('lang');
});

function Boom(): never {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  it('renders its children unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p data-testid="child">all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child').textContent).toBe('all good');
    // No fallback alert in the happy path.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('catches a render error and shows the English fallback by default', () => {
    // React logs the caught error to console.error; silence both that and the
    // boundary's own deliberate diagnostic so the run stays clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText(messagesEn.errorBoundary.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.errorBoundary.description)).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe(messagesEn.errorBoundary.reload);

    // componentDidCatch logged the on-device diagnostic.
    expect(
      consoleError.mock.calls.some((args) => String(args[0]).includes('[movar] ErrorBoundary')),
    ).toBe(true);
  });

  it('uses the Ukrainian fallback when the document lang is uk', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.documentElement.lang = 'uk';

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(messagesUk.errorBoundary.title)).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe(messagesUk.errorBoundary.reload);
  });

  it('reloads the page when the fallback Reload button is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable and throws "Not implemented"
    // when called, so it can't be spied directly — mock the `location` getter
    // to hand back a stand-in whose reload is observable. The real fields are
    // copied through a plain record (spreading the Location instance itself
    // would drop its prototype).
    const realLocation = globalThis.location as unknown as Record<string, unknown>;
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      ...realLocation,
      reload,
    } as unknown as Location);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
