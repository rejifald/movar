import { describe, expect, it, vi } from 'vitest';
import { COLOR_SCHEME_ATTR, applyColorSchemeToAll, detachAllBySelector } from './apply';

const HANDLE_KEY = '__movarCurtainHandle';

/** Attach a fake overlay handle (the shape curtain.ts/tooltip.ts store) to an
 *  element under the given key, returning the detach spy. */
function attachHandle(el: Element, key = HANDLE_KEY): ReturnType<typeof vi.fn> {
  const detach = vi.fn();
  (el as HTMLElement & Record<string, unknown>)[key] = { detach };
  return detach;
}

describe('applyColorSchemeToAll', () => {
  it('sets the color-scheme attribute on every matching host', () => {
    document.body.innerHTML = `<div class="host"></div><div class="host"></div>`;
    applyColorSchemeToAll(document, '.host', 'dark');
    const values = [...document.querySelectorAll('.host')].map((h) =>
      h.getAttribute(COLOR_SCHEME_ATTR),
    );
    expect(values).toEqual(['dark', 'dark']);
  });

  it('overwrites a stale value on a theme flip (light -> dark)', () => {
    document.body.innerHTML = `<div class="host" data-movar-color-scheme="light"></div>`;
    applyColorSchemeToAll(document, '.host', 'dark');
    expect(document.querySelector('.host')!.getAttribute(COLOR_SCHEME_ATTR)).toBe('dark');
  });

  it('leaves non-matching elements untouched', () => {
    document.body.innerHTML = `<div class="host"></div><span class="other"></span>`;
    applyColorSchemeToAll(document, '.host', 'dark');
    expect(document.querySelector('.other')!.getAttribute(COLOR_SCHEME_ATTR)).toBeNull();
  });

  it('is a no-op when nothing matches the selector', () => {
    document.body.innerHTML = `<div class="host"></div>`;
    expect(() => {
      applyColorSchemeToAll(document, '.nonexistent', 'dark');
    }).not.toThrow();
  });

  it('writes the documented data-movar-color-scheme attribute name', () => {
    expect(COLOR_SCHEME_ATTR).toBe('data-movar-color-scheme');
  });
});

describe('detachAllBySelector', () => {
  it('invokes the stored detach handle on every matching host', () => {
    document.body.innerHTML = `<div class="ov" id="a"></div><div class="ov" id="b"></div>`;
    const detachA = attachHandle(document.querySelector('#a')!);
    const detachB = attachHandle(document.querySelector('#b')!);
    detachAllBySelector(document, '.ov', HANDLE_KEY);
    expect(detachA).toHaveBeenCalledTimes(1);
    expect(detachB).toHaveBeenCalledTimes(1);
  });

  it('skips matching hosts that carry no handle (no throw)', () => {
    document.body.innerHTML = `<div class="ov" id="a"></div><div class="ov" id="b"></div>`;
    const detachA = attachHandle(document.querySelector('#a')!);
    // #b deliberately has no handle attached.
    expect(() => {
      detachAllBySelector(document, '.ov', HANDLE_KEY);
    }).not.toThrow();
    expect(detachA).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing matches the selector', () => {
    document.body.innerHTML = `<div class="ov"></div>`;
    expect(() => {
      detachAllBySelector(document, '.nonexistent', HANDLE_KEY);
    }).not.toThrow();
  });

  it('only fires handles stored under the requested key', () => {
    // curtain and tooltip use distinct keys; a sweep for one must not detach
    // the other's overlays sharing the same selector.
    document.body.innerHTML = `<div class="ov" id="a"></div>`;
    const wrongKeyDetach = attachHandle(document.querySelector('#a')!, '__movarTooltipHandle');
    detachAllBySelector(document, '.ov', HANDLE_KEY);
    expect(wrongKeyDetach).not.toHaveBeenCalled();
  });
});
