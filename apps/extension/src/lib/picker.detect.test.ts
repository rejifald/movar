import { describe, expect, it } from 'vitest';
import { activeLanguageFromPicker, detectPageLanguage, findLanguagePickers } from './picker';

describe('detectPageLanguage', () => {
  it('reads <html lang>', () => {
    document.documentElement.setAttribute('lang', 'ru-RU');
    expect(detectPageLanguage()).toBe('ru');
  });

  it('falls back to URL path segment', () => {
    document.documentElement.removeAttribute('lang');
    expect(detectPageLanguage(document, { pathname: '/ua/foo' })).toBe('uk');
  });

  it('returns null when neither signal is present', () => {
    expect(detectPageLanguage(document, { pathname: '/about' })).toBeNull();
  });
});

describe('detectPageLanguage — subdomain', () => {
  // ru.example.com / ua.example.com is one of the most common multilingual
  // patterns and currently slips past detection entirely.
  it('reads a language-coded subdomain (ru.example.com)', () => {
    const loc = { pathname: '/about', hostname: 'ru.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('html lang wins over a conflicting language-coded subdomain', () => {
    document.documentElement.setAttribute('lang', 'ru');
    const loc = { pathname: '/about', hostname: 'ua.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });

  it('maps the `ua` subdomain alias to uk', () => {
    const loc = { pathname: '/', hostname: 'ua.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('ignores non-language subdomain labels (www, m, api)', () => {
    const loc1 = { pathname: '/about', hostname: 'www.example.com' };
    expect(detectPageLanguage(document, loc1)).toBeNull();
    const loc2 = { pathname: '/about', hostname: 'm.example.com' };
    expect(detectPageLanguage(document, loc2)).toBeNull();
    const loc3 = { pathname: '/about', hostname: 'api.example.com' };
    expect(detectPageLanguage(document, loc3)).toBeNull();
  });

  it('does not treat the apex domain as a language', () => {
    const loc = { pathname: '/about', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});

describe('detectPageLanguage — deeper path segments', () => {
  it('finds a language code in the second path segment', () => {
    expect(detectPageLanguage(document, { pathname: '/store/ru/category' })).toBe('ru');
  });

  it('finds a language code in the third path segment', () => {
    expect(detectPageLanguage(document, { pathname: '/store/category/ru' })).toBe('ru');
  });

  it('does not match free-text slugs that contain hyphens (bosch regression)', () => {
    expect(detectPageLanguage(document, { pathname: '/ru-return-warranty' })).toBeNull();
  });
});

describe('detectPageLanguage — content-text fallback', () => {
  // The brief calls out filtering by preferred language; the basis for that
  // is being able to detect when the page itself is in a blocked language
  // even without an <html lang> or a language-coded URL.
  it('falls back to text-content detection when html lang and URL are neutral', () => {
    document.body.textContent = 'Привет, мир! Сегодня хорошая погода. Как дела?';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('detects Ukrainian content via text-content fallback', () => {
    document.body.textContent = 'Слава Україні! Це наш рідний край, наша мова та її традиції.';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('does not classify pages with only English text content', () => {
    document.body.textContent = 'Hello world, this is an English page.';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});

describe('detectPageLanguage — hreflang self-check', () => {
  it('reads <link rel="alternate" hreflang> matching the current URL', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="ru" href="https://example.com/page" />
      <link rel="alternate" hreflang="uk" href="https://example.com/uk/page" />
    `;
    const loc = {
      pathname: '/page',
      hostname: 'example.com',
      href: 'https://example.com/page',
    };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('returns the matching hreflang language even when html lang is absent', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="uk" href="https://example.com/" />
    `;
    const loc = { pathname: '/', hostname: 'example.com', href: 'https://example.com/' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('ignores an hreflang link whose href does not match the current page', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="ru" href="https://example.com/other" />
    `;
    const loc = { pathname: '/page', hostname: 'example.com', href: 'https://example.com/page' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});

describe('activeLanguageFromPicker', () => {
  const HREF_RU = 'https://example.com/ru/';
  const HREF_EN = 'https://example.com/en/';
  const HREF_UK = 'https://example.com/uk/';

  it('identifies a bare-text active locale (spizhenko.clinic pattern)', () => {
    // <div>UA | <a>RU</a> | <a>EN</a></div> — UA is plain text, the
    // active marker. The two anchors are switchers, classified by their
    // text labels. activeLanguageFromPicker reads the bare-text "UA"
    // (alias → 'uk') and returns it as the active language.
    document.body.innerHTML = `
      <div id="picker">UA | <a href="${HREF_RU}">RU</a> | <a href="${HREF_EN}">EN</a></div>
    `;
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(activeLanguageFromPicker(pickers[0]!, HREF_UK)).toBe('uk');
  });

  it('reads aria-current="page" on a classified link', () => {
    document.body.innerHTML = `
      <nav id="picker">
        <a href="${HREF_UK}" aria-current="page">UA</a>
        <a href="${HREF_RU}">RU</a>
        <a href="${HREF_EN}">EN</a>
      </nav>
    `;
    const pickers = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers[0]!, HREF_UK)).toBe('uk');
  });

  it('treats a non-anchor classified entry as active', () => {
    // The "you are here" entry is rendered as a span, not an anchor —
    // common pattern when the site removes the click target for the
    // current locale so users can't click into a same-page link.
    document.body.innerHTML = `
      <ul id="picker">
        <li><span class="lang-uk">UA</span></li>
        <li><a href="${HREF_RU}">RU</a></li>
        <li><a href="${HREF_EN}">EN</a></li>
      </ul>
    `;
    const pickers = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers[0]!, HREF_UK)).toBe('uk');
  });

  it('treats an anchor pointing at the current URL as active', () => {
    document.body.innerHTML = `
      <div id="picker">
        <a href="${HREF_UK}">UA</a>
        <a href="${HREF_RU}">RU</a>
        <a href="${HREF_EN}">EN</a>
      </div>
    `;
    const pickers = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers[0]!, HREF_UK)).toBe('uk');
  });

  it('reads class="active" / .is-current / .selected', () => {
    document.body.innerHTML = `
      <div id="picker">
        <a class="lang is-current" href="${HREF_UK}">UA</a>
        <a class="lang" href="${HREF_RU}">RU</a>
        <a class="lang" href="${HREF_EN}">EN</a>
      </div>
    `;
    const pickers = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers[0]!, 'https://example.com/something-else')).toBe('uk');
  });

  it('returns null when no entry has an active marker (every anchor switches away)', () => {
    document.body.innerHTML = `
      <div id="picker">
        <a href="${HREF_UK}">UA</a>
        <a href="${HREF_RU}">RU</a>
        <a href="${HREF_EN}">EN</a>
      </div>
    `;
    const pickers = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers[0]!, 'https://example.com/somewhere-else')).toBeNull();
  });

  it('returns null when the bare-text scan finds multiple unrepresented languages', () => {
    // Ambiguous: two text tokens that don't match any link. Abstain.
    document.body.innerHTML = `
      <div id="picker">UA / EN: <a href="${HREF_RU}">RU</a> | <a href="${HREF_EN}">EN</a></div>
    `;
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    // 'en' is excluded (already a link), 'uk' would be the only extra —
    // but 'EN' before the colon ALSO classifies as English and matches a
    // link, so it's filtered out. To truly trigger multi-extra, we'd
    // need two distinct bare-text languages neither of which is a link.
    // Use 'UA' + 'DE' instead:
    document.body.innerHTML = `
      <div id="picker2">UA | DE | <a href="${HREF_RU}">RU</a> | <a href="${HREF_EN}">EN</a></div>
    `;
    const pickers2 = findLanguagePickers();
    expect(activeLanguageFromPicker(pickers2[0]!, HREF_UK)).toBeNull();
  });
});

describe('detectPageLanguage — active picker beats stale <html lang>', () => {
  it('spizhenko.clinic: picker says UK, <html lang> wrongly says RU — picker wins', () => {
    // The exact scenario the bug report is about. The page-author's CMS
    // pins <html lang="ru"> on every locale; the picker reflects what
    // the client-side template actually rendered.
    document.documentElement.setAttribute('lang', 'ru');
    document.body.innerHTML = `
      <div id="picker">UA | <a href="https://spizhenko.clinic/konsul">RU</a> | <a href="https://spizhenko.clinic/en/konsul">EN</a></div>
    `;
    const loc = {
      pathname: '/uk/konsultacija-vracha-onkologa',
      hostname: 'spizhenko.clinic',
      href: 'https://spizhenko.clinic/uk/konsultacija-vracha-onkologa',
    };
    expect(detectPageLanguage(document, loc)).toBe('uk');
    document.documentElement.removeAttribute('lang');
  });

  it('falls through to <html lang> when no picker is visible', () => {
    document.documentElement.setAttribute('lang', 'ru');
    expect(detectPageLanguage(document, { pathname: '/' })).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });

  it('falls through when pickers disagree (no consensus, abstain)', () => {
    document.documentElement.setAttribute('lang', 'ru');
    // Header picker says UK active, footer picker says EN active —
    // genuine ambiguity, fall back to <html lang>.
    document.body.innerHTML = `
      <header><div>UA | <a href="https://e.com/ru/">RU</a> | <a href="https://e.com/en/">EN</a></div></header>
      <footer><div><a href="https://e.com/uk/">UA</a> | <a href="https://e.com/ru/">RU</a> | EN</div></footer>
    `;
    expect(detectPageLanguage(document, { pathname: '/' })).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });
});
