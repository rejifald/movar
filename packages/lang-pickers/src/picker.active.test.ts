import { describe, expect, it } from 'vitest';
import { activeLanguageFromPicker, languagesInText } from './active';
import { buildPickerModel } from './build-model';
import { findLanguagePickers } from './extract';
import { elFromHtml, setBody } from './picker.test-utils';
import type { ClassifiedLink, Picker } from './types';

/** Build the single picker the given body HTML is expected to yield. Throws
 *  loudly if the DOM doesn't classify to exactly one picker, so a regression in
 *  findLanguagePickers can't quietly make these active-language tests vacuous. */
function pickerFromBody(html: string): Picker {
  setBody(html);
  const pickers = findLanguagePickers();
  if (pickers.length !== 1) {
    throw new Error(`expected exactly one picker, got ${pickers.length}`);
  }
  return pickers[0]!;
}

describe('languagesInText', () => {
  it('extracts every language token from a separator-joined label', () => {
    expect(languagesInText('UA | DE')).toEqual(['uk', 'de']);
  });

  it('returns a single language for a plain token', () => {
    expect(languagesInText('UA')).toEqual(['uk']);
  });

  it('returns an empty list when nothing in the text classifies', () => {
    expect(languagesInText('Switch language')).toEqual([]);
  });
});

describe('activeLanguageFromPicker — marker signals', () => {
  it('uses aria-current="page" to mark the active language', () => {
    const p = pickerFromBody(
      '<ul><li><a aria-current="page" href="/uk/x">UK</a></li><li><a href="/ru/x">RU</a></li></ul>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('treats a non-anchor entry (active locale rendered as a span) as the active one', () => {
    const p = pickerFromBody(
      '<div id="p"><span class="lang-uk">UK</span><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('does NOT treat a bare href="#" anchor as active when it is one of several candidates', () => {
    // A `#`/empty/javascript: href is just as often a JS switcher for ANOTHER
    // language as a "you are here" marker. With a real switcher sibling present
    // and no corroborating aria/class signal, abstain rather than misread the
    // dead-href entry as the current language (which would e.g. make a Russian
    // page look already-switched). `x-uk` is not an active-class token.
    const p = pickerFromBody(
      '<div id="p"><a href="#" class="x-uk">UK</a><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBeNull();
  });

  it('does NOT treat a target-language href="#" anchor as the active language', () => {
    // The dangerous case from #106: the page is Russian, and the picker offers a
    // `#`-href anchor to switch TO Ukrainian. The old rule read that as "active =
    // uk" and suppressed the switch. It must not be returned as active.
    const p = pickerFromBody(
      '<div id="p"><a href="/ru/x" class="ru-link">RU</a><a href="#" id="uk">UK</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/ru/x')).not.toBe('uk');
  });

  it('treats a bare-href anchor corroborated by aria-current as active', () => {
    const p = pickerFromBody(
      '<div id="p"><a href="#" aria-current="page">UK</a><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('treats a bare-href anchor corroborated by an active class as active', () => {
    const p = pickerFromBody(
      '<div id="p"><a href="#" class="active lang-uk">UK</a><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('treats a SOLE bare-href anchor as the active language (no sibling to switch to)', () => {
    // Built directly: a one-entry picker has no sibling to switch to, so the
    // dead-href anchor can only be "you are here". (findLanguagePickers needs
    // ≥2 entries, so this is constructed rather than parsed from the DOM.)
    const container = elFromHtml<HTMLDivElement>('<div id="p"><a href="#" id="uk">UK</a></div>');
    const links: ClassifiedLink[] = [
      { el: container.querySelector<HTMLAnchorElement>('#uk')!, language: 'uk' },
    ];
    expect(activeLanguageFromPicker({ container, links }, 'http://localhost/')).toBe('uk');
  });

  it('treats an anchor whose href is the current URL as the active language', () => {
    const p = pickerFromBody(
      '<div id="p"><a href="http://localhost/uk" class="lang-uk">UK</a><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/uk')).toBe('uk');
  });

  it('treats a disabled <button> as the active (non-switching) language', () => {
    const p = pickerFromBody(
      '<form id="p"><button disabled class="lang-uk">UK</button><button class="lang-ru">RU</button></form>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('falls back to an active/current/selected class marker', () => {
    const p = pickerFromBody(
      '<div id="p"><a href="/uk/x" class="active lang-uk">UK</a><a href="/ru/x">RU</a></div>',
    );
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBe('uk');
  });

  it('uses a bare-text token not covered by any link (UA | <a>RU</a> | <a>EN</a>)', () => {
    const container = elFromHtml<HTMLDivElement>(
      '<div>UA | <a href="?lang=ru" id="ru">RU</a> | <a href="?lang=en" id="en">EN</a></div>',
    );
    const links: ClassifiedLink[] = [
      { el: container.querySelector<HTMLAnchorElement>('#ru')!, language: 'ru' },
      { el: container.querySelector<HTMLAnchorElement>('#en')!, language: 'en' },
    ];
    expect(activeLanguageFromPicker({ container, links }, 'http://localhost/')).toBe('uk');
  });

  it('abstains (null) when no entry is marked active', () => {
    const p = pickerFromBody('<div id="p"><a href="/uk/x">UK</a><a href="/ru/x">RU</a></div>');
    expect(activeLanguageFromPicker(p, 'http://localhost/')).toBeNull();
  });

  it('abstains for <li>-wrapped dead-href switchers (OpenCart / yato.com.ua)', () => {
    // Each option is `<li class="…lang…"><a href="#" data-code>…</a></li>`, so
    // dedupNested keeps the non-anchor `<li>` wrappers as the classified links.
    // A `<li>` wrapping a dead-href JS switcher is NOT a "you are here" marker —
    // pre-fix the FIRST option ('ru') was read as active, mis-detecting a
    // Ukrainian page as Russian. The picker must abstain.
    const p = pickerFromBody(
      '<ul id="p">' +
        '<li class="language-option"><a href="#" data-code="ru-ru">Русский</a></li>' +
        '<li class="language-option"><a href="#" data-code="uk-ua">Українська</a></li>' +
        '</ul>',
    );
    // Guard: the classified links really are the `<li>` wrappers, not the anchors.
    expect(p.links.map((l) => l.el.tagName)).toEqual(['LI', 'LI']);
    expect(activeLanguageFromPicker(p, 'https://shop.example/search?q=x')).toBeNull();
  });

  it('reads a <li> wrapping a self-link anchor as the active language', () => {
    // The wrapper resolves to its lone switcher: when that anchor is a real
    // self-link (href === current URL), the entry IS the active language. Guards
    // that the OpenCart fix didn't blind the wrapped-self-link case.
    const p = pickerFromBody(
      '<ul id="p">' +
        '<li class="language-option"><a href="https://shop.example/uk/x">UK</a></li>' +
        '<li class="language-option"><a href="https://shop.example/ru/x">RU</a></li>' +
        '</ul>',
    );
    expect(activeLanguageFromPicker(p, 'https://shop.example/uk/x')).toBe('uk');
  });

  it('still treats a bare <li> marker (no switcher inside) as the active language', () => {
    // Regression guard for the fix itself: a non-anchor wrapper with NO
    // interactive descendant is still the "you are here" marker.
    const p = pickerFromBody(
      '<ul id="p">' +
        '<li class="lang-active">UK</li>' +
        '<li class="language-option"><a href="/ru/x">RU</a></li>' +
        '</ul>',
    );
    expect(activeLanguageFromPicker(p, 'https://shop.example/')).toBe('uk');
  });

  it('abstains (null) when bare text names two different languages', () => {
    const container = elFromHtml<HTMLDivElement>(
      '<div>UA | DE | <a href="?lang=ru" id="ru">RU</a> | <a href="?lang=en" id="en">EN</a></div>',
    );
    const links: ClassifiedLink[] = [
      { el: container.querySelector<HTMLAnchorElement>('#ru')!, language: 'ru' },
      { el: container.querySelector<HTMLAnchorElement>('#en')!, language: 'en' },
    ];
    expect(activeLanguageFromPicker({ container, links }, 'http://localhost/')).toBeNull();
  });
});

describe('buildPickerModel', () => {
  it('aggregates a single active language across pickers', () => {
    const p = pickerFromBody(
      '<div id="p"><span class="lang-uk">UK</span><a href="/ru/x">RU</a></div>',
    );
    expect(buildPickerModel([p], 'http://localhost/').activeLanguage).toBe('uk');
  });

  it('abstains (null) when two pickers disagree on the active language', () => {
    const c1 = elFromHtml<HTMLDivElement>(
      '<div><span class="lang-uk">UK</span><a href="/ru/x">RU</a></div>',
    );
    const c2 = elFromHtml<HTMLDivElement>(
      '<div><span class="lang-ru">RU</span><a href="/uk/x">UK</a></div>',
    );
    const p1: Picker = {
      container: c1,
      links: [
        { el: c1.querySelector('span')!, language: 'uk' },
        { el: c1.querySelector('a')!, language: 'ru' },
      ],
    };
    const p2: Picker = {
      container: c2,
      links: [
        { el: c2.querySelector('span')!, language: 'ru' },
        { el: c2.querySelector('a')!, language: 'uk' },
      ],
    };
    expect(buildPickerModel([p1, p2], 'http://localhost/').activeLanguage).toBeNull();
  });
});
