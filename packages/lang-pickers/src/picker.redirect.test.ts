import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from './extract';
import { pickRedirectTarget } from './redirect';
import { setBody } from './picker.test-utils';

describe('pickRedirectTarget — descend into wrappers', () => {
  it('returns the inner anchor when the classified element is a wrapper', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><a id="uk-link" href="/uk/x">Українська</a></li>
        <li data-lang="ru"><a href="/ru/x">Русский</a></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.target.id).toBe('uk-link');
  });

  it('returns null when the wrapper has no inner clickable (covers inner ?? null branch)', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><span>Українська</span></li>
        <li data-lang="ru"><span>Русский</span></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])).toBeNull();
  });

  it('returns a <button> when the picker is form-POST based (bosch-style)', () => {
    setBody(`
      <form id="form-language">
        <button type="button" id="ru-btn" class="language-select active" title="Russian">ru</button>
        <button type="button" id="ua-btn" class="language-select" title="Українська">ua</button>
      </form>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.target.id).toBe('ua-btn');
    expect(pickRedirectTarget(pickers, ['ru'])?.target.id).toBe('ru-btn');
  });
});

describe('pickRedirectTarget — collapsed switchers', () => {
  it('never returns a dropdown toggle — activating it only opens the menu', () => {
    // The Bootstrap `.btn-group` shape (tradeport.ua, yato.com.ua) as it renders
    // on a page that is ALREADY Ukrainian: the toggle wears the language you are
    // currently in and the menu holds the alternative. The toggle is therefore
    // the picker's only `uk` entry, so a naive priority match hands it back.
    setBody(`
      <div id="switcher">
        <button id="toggle" class="dropdown-toggle" data-toggle="dropdown" data-lang="uk">УКР</button>
        <ul class="dropdown-menu">
          <li><a id="ru" href="/ru/x" data-lang="ru">Русский</a></li>
        </ul>
      </div>
    `);
    const pickers = findLanguagePickers();
    // The toggle must be in the picker for this to be a real test — otherwise
    // the null below would be a trivial "no uk entry" pass.
    expect(pickers[0]?.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
    expect(pickRedirectTarget(pickers, ['uk'])).toBeNull();
  });

  it.each([
    ['aria-haspopup="true"'],
    ['aria-haspopup="menu"'],
    ['aria-expanded="false"'],
    ['data-toggle="dropdown"'],
    ['data-bs-toggle="dropdown"'],
    ['role="combobox"'],
  ])('rejects a toggle marked with %s', (attr) => {
    setBody(`
      <div id="switcher">
        <button id="toggle" ${attr} data-lang="uk">УКР</button>
        <ul><li><a id="ru" href="/ru/x" data-lang="ru">Русский</a></li></ul>
      </div>
    `);
    expect(pickRedirectTarget(findLanguagePickers(), ['uk'])).toBeNull();
  });

  it('still returns a button that merely declares it opens nothing', () => {
    // `aria-haspopup="false"` is the explicit "I am not a menu opener" value —
    // the guard must not read the attribute's mere presence as a toggle.
    setBody(`
      <div id="switcher">
        <button id="uk-btn" aria-haspopup="false" data-lang="uk">УКР</button>
        <button id="ru-btn" data-lang="ru">РУС</button>
      </div>
    `);
    expect(pickRedirectTarget(findLanguagePickers(), ['uk'])?.target.id).toBe('uk-btn');
  });

  it('does not downgrade to a lower-priority language when the preferred one is inert', () => {
    setBody(`
      <div id="switcher">
        <button id="toggle" data-toggle="dropdown" data-lang="uk">УКР</button>
        <a id="ru" href="/ru/x" data-lang="ru">Русский</a>
        <a id="en" href="/en/x" data-lang="en">English</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    // 'uk' IS on offer — the page is already serving it, which is precisely why
    // its only entry is the toggle. Falling through to 'en' would switch an
    // already-Ukrainian page into English.
    expect(pickRedirectTarget(pickers, ['uk', 'en'])).toBeNull();
    // The same picker still resolves normally for a preference it can satisfy.
    expect(pickRedirectTarget(pickers, ['en', 'uk'])?.target.id).toBe('en');
  });

  it('takes a usable entry from another picker rather than giving up', () => {
    setBody(`
      <header>
        <div id="header-switcher">
          <button id="toggle" data-toggle="dropdown" data-lang="uk">УКР</button>
          <ul><li><a id="header-ru" href="/ru/x" data-lang="ru">Русский</a></li></ul>
        </div>
      </header>
      <footer id="footer-switcher">
        <a id="footer-uk" href="/uk/x" data-lang="uk">Українська</a>
        <a id="footer-ru" href="/x" data-lang="ru">Русский</a>
      </footer>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(2);
    // The header toggle is the first 'uk' entry in DOM order; skipping it must
    // not abandon the real footer switcher behind it.
    expect(pickRedirectTarget(pickers, ['uk'])?.target.id).toBe('footer-uk');
  });
});

describe('pickRedirectTarget', () => {
  it('returns the highest-priority available anchor', () => {
    setBody(`
      <div id="picker">
        <a id="ru" href="/ru/x">RU</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk', 'en'])?.target.id).toBe('ua');
    expect(pickRedirectTarget(pickers, ['en', 'uk'])?.target.id).toBe('en');
  });

  it('falls through to the next priority language when the first is absent (if (!match) continue branch)', () => {
    setBody(`
      <div id="picker">
        <a id="ru" href="/ru/x">RU</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    // 'fr' is not present in the picker → must skip to 'en'.
    const picked = pickRedirectTarget(pickers, ['fr', 'en']);
    expect(picked?.target.id).toBe('en');
    // The matched language must be the one actually found ('en'), NOT the
    // unmatched head of the priority list ('fr') — this is the exact value a
    // caller records to the correction dashboard (issue #299).
    expect(picked?.language).toBe('en');
  });

  it('skips non-anchor classified elements (no href to follow)', () => {
    setBody(`
      <li id="header-languages">
        <a id="ua" href="/ua/x" class="ua-link">українською</a>
        <span class="ru-link">по-русски</span>
      </li>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.target.id).toBe('ua');
    expect(pickRedirectTarget(pickers, ['ru'])).toBeNull();
  });

  it('returns null when no priority language is present', () => {
    setBody(`
      <div id="picker">
        <a href="/ru/x">RU</a>
        <a href="/pl/x">PL</a>
      </div>
    `);
    expect(pickRedirectTarget(findLanguagePickers(), ['uk', 'en'])).toBeNull();
  });
});
