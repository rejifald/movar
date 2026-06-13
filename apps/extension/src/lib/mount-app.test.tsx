import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { mountApp } from './mount-app';

afterEach(cleanup);

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = 'en';
  fakeBrowser.reset();
});

function Hello() {
  return <p data-testid="mounted">hello from app</p>;
}

function withRoot(): void {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
}

describe('mountApp', () => {
  it('mounts the app into the #root element', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    act(() => {
      mountApp(Hello);
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
      mountApp(Hello);
    }).not.toThrow();
    expect(document.querySelector('[data-testid="mounted"]')).toBeNull();
  });

  it('seeds <html lang> from the browser UI language before React renders', () => {
    // Pre-React best-effort so a first-render crash (ErrorBoundary above
    // I18nProvider) still picks the Ukrainian fallback for a Ukrainian browser.
    vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('uk-UA');
    withRoot();

    act(() => {
      mountApp(Hello);
    });

    expect(document.documentElement.lang).toBe('uk');
  });

  it('leaves the document lang untouched when browser.i18n is unavailable (preview)', () => {
    // Static-serve preview: getUILanguage throws — the guard must swallow it and
    // leave the HTML's default lang in place.
    vi.spyOn(browser.i18n, 'getUILanguage').mockImplementation(() => {
      throw new Error('no i18n in preview');
    });
    withRoot();

    act(() => {
      mountApp(Hello);
    });

    expect(document.documentElement.lang).toBe('en');
  });
});
