import { beforeEach, describe, expect, it } from 'vitest';
import {
  modeFromColorSchemeAttr,
  modeFromColorSchemeMeta,
  modeFromComputedBackground,
} from './detect';

/** A Window whose getComputedStyle delegates to jsdom's real implementation —
 *  enough for the meta and computed-background tiers. These edge cases never
 *  reach the prefers-color-scheme tier, so no matchMedia is needed. */
function fakeWin(): Window {
  return {
    getComputedStyle: (el: Element) => globalThis.getComputedStyle(el),
  } as unknown as Window;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.removeAttribute('style');
  const html = document.documentElement;
  html.removeAttribute('class');
  html.removeAttribute('color-scheme');
  html.removeAttribute('style');
});

describe('modeFromColorSchemeAttr — framework conventions', () => {
  it('recognises framework dark class tokens (theme-dark, dark-mode)', () => {
    document.documentElement.className = 'app theme-dark loaded';
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
    document.documentElement.className = 'dark-mode';
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('recognises a framework light class token (is-light)', () => {
    document.documentElement.className = 'is-light';
    expect(modeFromColorSchemeAttr(document)).toBe('light');
  });

  it('recognises the literal color-scheme attribute on <html>', () => {
    document.documentElement.setAttribute('color-scheme', 'dark');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });
});

describe('modeFromColorSchemeMeta — no-preference values', () => {
  it('returns null for "normal" (the CSS initial value declares no preference)', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="normal">';
    document.documentElement.style.colorScheme = '';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBeNull();
  });
});

describe('modeFromComputedBackground — partial transparency', () => {
  it('classifies a semi-transparent background by colour (alpha only gates FULL transparency)', () => {
    // alpha 0.5 isn't fully transparent — the element is painting, so classify
    // by its (dark) colour rather than deferring to the next element.
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('dark');
  });
});
