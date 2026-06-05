import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModeDetectorsForTesting,
  detectModeForHost,
  lookupModeDetector,
  registerModeDetector,
} from './registry';
import type { PageModeDetector } from './types';

function fakeLightWin(): Window {
  return {
    matchMedia: () =>
      ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
    getComputedStyle: (el: Element) => globalThis.getComputedStyle(el),
  } as unknown as Window;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
});
afterEach(() => {
  clearModeDetectorsForTesting();
});

describe('lookupModeDetector', () => {
  it('returns null when no detector matches the host', () => {
    expect(lookupModeDetector('example.com')).toBeNull();
  });

  it('returns the first matching detector', () => {
    const a: PageModeDetector = {
      id: 'a',
      matches: (h) => h === 'a.com',
      detect: () => 'dark',
    };
    const b: PageModeDetector = {
      id: 'b',
      matches: (h) => h === 'b.com',
      detect: () => 'light',
    };
    registerModeDetector(a);
    registerModeDetector(b);
    expect(lookupModeDetector('b.com')?.id).toBe('b');
    expect(lookupModeDetector('a.com')?.id).toBe('a');
  });

  it('returns the registration-order first match when multiple detectors match', () => {
    const first: PageModeDetector = {
      id: 'first',
      matches: () => true,
      detect: () => 'dark',
    };
    const second: PageModeDetector = {
      id: 'second',
      matches: () => true,
      detect: () => 'light',
    };
    registerModeDetector(first);
    registerModeDetector(second);
    expect(lookupModeDetector('anything.com')?.id).toBe('first');
  });
});

describe('detectModeForHost', () => {
  it('falls back to the generic chain when no detector is registered', () => {
    // Generic chain — tier 1 finds data-theme="dark".
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(detectModeForHost('any-host.com', document, fakeLightWin())).toBe('dark');
  });

  it('uses the detector when one matches and it returns a value', () => {
    registerModeDetector({
      id: 'forces-dark',
      matches: (h) => h === 'forced.com',
      detect: () => 'dark',
    });
    // No generic-chain signal; generic would return "light" from the fake
    // win. The detector wins.
    expect(detectModeForHost('forced.com', document, fakeLightWin())).toBe('dark');
  });

  it('falls back to the generic chain when a matching detector returns null (defer)', () => {
    registerModeDetector({
      id: 'deferring',
      matches: (h) => h === 'defers.com',
      detect: () => null,
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(detectModeForHost('defers.com', document, fakeLightWin())).toBe('dark');
  });

  it('always returns a non-null PageMode (generic tier 4 is the floor)', () => {
    const result = detectModeForHost('no-signal.com', document, fakeLightWin());
    expect(['light', 'dark']).toContain(result);
  });
});

describe('clearModeDetectorsForTesting', () => {
  it('wipes every registered detector', () => {
    registerModeDetector({
      id: 'first',
      matches: () => true,
      detect: () => 'dark',
    });
    expect(lookupModeDetector('anything')).not.toBeNull();
    clearModeDetectorsForTesting();
    expect(lookupModeDetector('anything')).toBeNull();
  });
});
