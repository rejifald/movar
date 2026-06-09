import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTouchEnvironment } from './is-touch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTouchEnvironment', () => {
  it('treats missing matchMedia as hover-capable', () => {
    vi.stubGlobal('matchMedia', null);

    expect(isTouchEnvironment()).toBe(false);
  });

  it('uses the hover:none media query when matchMedia exists', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);

    expect(isTouchEnvironment()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(hover: none)');
  });
});
