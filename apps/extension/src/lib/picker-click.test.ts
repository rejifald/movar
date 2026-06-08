import { afterEach, describe, expect, it } from 'vitest';
import { isInsideKnownPicker, nearestClassifiedLanguage, pickerChoiceForTarget } from './picker-click';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Render `html` into the body and return the element with id `pick`. */
function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.getElementById('pick')!;
}

describe('nearestClassifiedLanguage', () => {
  it('returns the language of the nearest classifiable ancestor', () => {
    const inner = render('<a href="/ru/x" hreflang="ru"><span id="pick">Русский</span></a>');
    expect(nearestClassifiedLanguage(inner)).toBe('ru');
  });

  it('returns null when nothing up to <body> classifies as a language', () => {
    const inner = render('<div><p id="pick">just some prose</p></div>');
    expect(nearestClassifiedLanguage(inner)).toBeNull();
  });

  it('returns null for a null start element', () => {
    expect(nearestClassifiedLanguage(null)).toBeNull();
  });
});

describe('isInsideKnownPicker', () => {
  it('is true when an ancestor is a known container', () => {
    const link = render('<div id="box"><a id="pick" href="/ru">x</a></div>');
    const known = new WeakSet<HTMLElement>([document.getElementById('box')!]);
    expect(isInsideKnownPicker(link, known)).toBe(true);
  });

  it('is false when no ancestor is in the known set', () => {
    const link = render('<div id="box"><a id="pick" href="/ru">x</a></div>');
    expect(isInsideKnownPicker(link, new WeakSet())).toBe(false);
  });

  it('is false for a null element', () => {
    expect(isInsideKnownPicker(null, new WeakSet())).toBe(false);
  });
});

describe('pickerChoiceForTarget', () => {
  it('returns the chosen language for a click inside a known picker', () => {
    const link = render('<div id="box"><a id="pick" href="/ru/x" hreflang="ru">Русский</a></div>');
    const known = new WeakSet<HTMLElement>([document.getElementById('box')!]);
    expect(pickerChoiceForTarget(link, known)).toBe('ru');
  });

  it('returns null for an incidental link outside any known picker', () => {
    const link = render('<a id="pick" href="/ru/x" hreflang="ru">Read in Russian</a>');
    expect(pickerChoiceForTarget(link, new WeakSet())).toBeNull();
  });

  it('returns null when the click is in a known picker but classifies to nothing', () => {
    const link = render('<div id="box"><span id="pick">no language here</span></div>');
    const known = new WeakSet<HTMLElement>([document.getElementById('box')!]);
    expect(pickerChoiceForTarget(link, known)).toBeNull();
  });

  it('returns null for a null target', () => {
    expect(pickerChoiceForTarget(null, new WeakSet())).toBeNull();
  });
});
