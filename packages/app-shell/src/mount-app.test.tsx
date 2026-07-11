import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { mountApp } from './mount-app';

afterEach(cleanup);

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = 'en';
});

function Hello() {
  return <p data-testid="mounted">hello from app</p>;
}

function Boom(): never {
  throw new Error('render exploded');
}

function withRoot(): HTMLDivElement {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  return root;
}

describe('mountApp', () => {
  it('mounts the app into the #root element', () => {
    const root = withRoot();

    act(() => {
      mountApp(<Hello />);
    });

    const mounted = document.querySelector('[data-testid="mounted"]');
    expect(mounted).not.toBeNull();
    expect(mounted?.textContent).toBe('hello from app');
    // It rendered *inside* the #root container, not loose in the body.
    expect(root.contains(mounted)).toBe(true);
  });

  it('is a no-op when #root is absent', () => {
    // No #root in the document — mountApp must bail without throwing.
    expect(() => {
      act(() => {
        mountApp(<Hello />);
      });
    }).not.toThrow();
    expect(document.querySelector('[data-testid="mounted"]')).toBeNull();
  });

  it('seeds <html lang> from the injected browser UI language', () => {
    // Pre-React best-effort so a first-render crash (ErrorBoundary above
    // I18nProvider) still picks the Ukrainian fallback for a Ukrainian browser.
    withRoot();

    act(() => {
      mountApp(<Hello />, { browserUiLanguage: 'uk-UA' });
    });

    expect(document.documentElement.lang).toBe('uk');
  });

  it('leaves the document lang untouched when no browser UI language is given', () => {
    // The static-serve preview omits it (browser.i18n unavailable) — the seed
    // must be skipped and the HTML's default lang left in place.
    withRoot();

    act(() => {
      mountApp(<Hello />, {});
    });

    expect(document.documentElement.lang).toBe('en');
  });

  it('wraps the tree in the crash ErrorBoundary', () => {
    // A child that throws on first render surfaces the fallback panel rather
    // than tearing the whole surface down.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    withRoot();

    act(() => {
      mountApp(<Boom />);
    });

    expect(screen.getByRole('alert')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('forwards panelClassName through to the crash fallback panel', () => {
    // The popup relies on this to keep its crashed floating window at the
    // healthy 360px width instead of collapsing to a cramped default.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    withRoot();

    act(() => {
      mountApp(<Boom />, { panelClassName: 'w-[360px] max-w-full' });
    });

    expect(screen.getByRole('alert').className).toContain('w-[360px]');
    vi.restoreAllMocks();
  });
});
