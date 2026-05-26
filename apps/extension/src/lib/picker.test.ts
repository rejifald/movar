import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyLanguageElement,
  detectPageLanguage,
  filterPickers,
  findLanguagePickers,
  pickRedirectTarget,
} from './picker';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function elFromHtml<T extends HTMLElement>(html: string): T {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  document.body.appendChild(div);
  return div.firstElementChild as T;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

describe('classifyLanguageElement — anchors', () => {
  it('classifies via hreflang attribute', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="/foo" hreflang="uk">x</a>');
    expect(classifyLanguageElement(a)?.language).toBe('uk');
  });

  it('treats the "ua" alias as Ukrainian', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/ua/foo">UA</a>');
    expect(classifyLanguageElement(a)?.language).toBe('uk');
  });

  it('classifies via path segment "ru"', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/ru/foo">RU</a>');
    expect(classifyLanguageElement(a)?.language).toBe('ru');
  });

  it('classifies via ?lang= query param', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/?lang=en">English</a>');
    expect(classifyLanguageElement(a)?.language).toBe('en');
  });

  it('classifies via short text "Українська"', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/">Українська</a>');
    expect(classifyLanguageElement(a)?.language).toBe('uk');
  });

  it('strips BCP47 region suffix from hreflang', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="/x" hreflang="en-US">English</a>');
    expect(classifyLanguageElement(a)?.language).toBe('en');
  });

  it('returns null for non-language links', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/about">About us</a>');
    expect(classifyLanguageElement(a)).toBeNull();
  });

  it('ignores long text that happens to contain a language word', () => {
    const a = elFromHtml<HTMLAnchorElement>(
      '<a href="https://example.com/">Click here to switch language</a>',
    );
    expect(classifyLanguageElement(a)).toBeNull();
  });
});

describe('classifyLanguageElement — broader patterns', () => {
  it('classifies via flag-icons-css pattern "fi fi-ua"', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="fi fi-ua"></span>');
    expect(classifyLanguageElement(s)?.language).toBe('uk');
  });

  it('classifies via flag-icon-de class', () => {
    const div = elFromHtml<HTMLDivElement>('<div class="flag-icon flag-icon-de"></div>');
    expect(classifyLanguageElement(div)?.language).toBe('de');
  });

  it('classifies via aria-label "in English"', () => {
    const btn = elFromHtml<HTMLButtonElement>(
      '<button aria-label="in English"><img src="/en.png" /></button>',
    );
    expect(classifyLanguageElement(btn)?.language).toBe('en');
  });

  it('classifies via title attribute', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="#" title="Deutsch"></a>');
    expect(classifyLanguageElement(a)?.language).toBe('de');
  });

  it('classifies an anchor by descendant <img alt>', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="#"><img src="/de.png" alt="Deutsch" /></a>');
    expect(classifyLanguageElement(a)?.language).toBe('de');
  });

  it('ignores library-prefix-only classes like "fa fa-something"', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="fa fa-bars"></span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });

  it('ignores Tailwind utility classes (no false positive on "mb-2 mt-2")', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="mb-2 mt-2 px-4">Hello</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });

  it('ignores "active selected current" state classes alone', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="active selected current">X</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });
});

describe('classifyLanguageElement — non-anchors', () => {
  it('classifies a span via class name "ru-link"', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="ru-link">по-русски</span>');
    expect(classifyLanguageElement(s)?.language).toBe('ru');
  });

  it('classifies via class name "lang-uk"', () => {
    const div = elFromHtml<HTMLDivElement>('<div class="lang-uk">UK</div>');
    expect(classifyLanguageElement(div)?.language).toBe('uk');
  });

  it('classifies via class name "locale-en-flag"', () => {
    const div = elFromHtml<HTMLDivElement>('<div class="locale-en-flag"></div>');
    expect(classifyLanguageElement(div)?.language).toBe('en');
  });

  it('classifies via data-lang attribute', () => {
    const div = elFromHtml<HTMLDivElement>('<div data-lang="de">Deutsch</div>');
    expect(classifyLanguageElement(div)?.language).toBe('de');
  });

  it('classifies a span by localized phrase "українською"', () => {
    const s = elFromHtml<HTMLSpanElement>('<span>українською</span>');
    expect(classifyLanguageElement(s)?.language).toBe('uk');
  });

  it('classifies a span by localized phrase "по-русски"', () => {
    const s = elFromHtml<HTMLSpanElement>('<span>по-русски</span>');
    expect(classifyLanguageElement(s)?.language).toBe('ru');
  });

  it('ignores noise class names', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="divider">&nbsp;</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });

  it('ignores unrelated 3-letter classes that are not language codes', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="big-link">Big</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });
});

describe('findLanguagePickers', () => {
  it('finds a simple two-anchor picker', () => {
    setBody(`
      <div id="picker" class="lang">
        <a href="https://example.com/ua/foo">UA</a>
        <a href="https://example.com/ru/foo">RU</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    const picker = pickers[0]!;
    expect(picker.container.id).toBe('picker');
    expect(picker.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
  });

  it('finds the electrica-shop picker (active-language span + switch anchor)', () => {
    setBody(`
      <ul>
        <li id="header-languages">
          <a href="/ua/error404.htm" class="ua-link" title="Украинский язык">українською</a>
          <span class="divider">&nbsp;</span>
          <span class="ru-link" title="Русский язык">по-русски</span>
        </li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    const picker = pickers[0]!;
    expect(picker.container.id).toBe('header-languages');
    expect(picker.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
  });

  it('finds two separate pickers (header + footer)', () => {
    setBody(`
      <header><div class="lang"><a href="/ua/x">UA</a><a href="/ru/x">RU</a></div></header>
      <footer><div class="lang"><a href="/ua/x">UA</a><a href="/ru/x">RU</a></div></footer>
    `);
    expect(findLanguagePickers()).toHaveLength(2);
  });

  it('returns empty when only one language link is present and no siblings classify', () => {
    setBody('<div><a href="/ua/foo">UA</a><span class="unrelated">x</span></div>');
    expect(findLanguagePickers()).toEqual([]);
  });

  it('finds a picker with no anchors (all data-lang spans)', () => {
    setBody(`
      <ul class="lang-picker">
        <li data-lang="uk" class="active">Українська</li>
        <li data-lang="en">English</li>
        <li data-lang="ru">Русский</li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual(['en', 'ru', 'uk']);
  });

  it('dedupes nested classifications — keeps the outer wrapper, not the inner anchor', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><a href="/uk/x">Українська</a></li>
        <li data-lang="ru"><a href="/ru/x">Русский</a></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    // Should be exactly 2 classified items, both <li> (not <a>).
    expect(pickers[0]!.links).toHaveLength(2);
    expect(pickers[0]!.links.every((l) => l.el.tagName === 'LI')).toBe(true);
  });

  it('finds a flag-only picker (anchors with just <img alt>)', () => {
    setBody(`
      <div class="lang-switcher">
        <a href="#" id="ua-flag"><img src="/ua.svg" alt="Українська" /></a>
        <a href="#" id="ru-flag"><img src="/ru.svg" alt="Русский" /></a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
  });
});

describe('pickRedirectTarget — descend into wrappers', () => {
  it('returns the inner anchor when the classified element is a wrapper', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><a id="uk-link" href="/uk/x">Українська</a></li>
        <li data-lang="ru"><a href="/ru/x">Русский</a></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('uk-link');
  });

  it('returns a <button> when the picker is form-POST based (bosch-style)', () => {
    setBody(`
      <form id="form-language">
        <button type="button" id="ru-btn" class="language-select active" title="Russian">ru</button>
        <button type="button" id="ua-btn" class="language-select" title="Українська">ua</button>
      </form>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('ua-btn');
    expect(pickRedirectTarget(pickers, ['ru'])?.id).toBe('ru-btn');
  });
});

describe('filterPickers — keep semantics', () => {
  it('hides languages not in the keep list', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(result.hiddenLinks.map((l) => l.language).sort()).toEqual(['de', 'ru']);
    expect(document.getElementById('ua')!.style.display).toBe('');
    expect(document.getElementById('en')!.style.display).toBe('');
    expect(document.getElementById('ru')!.style.display).toBe('none');
    expect(document.getElementById('de')!.style.display).toBe('none');
  });

  it('hides the whole container when only one language remains', () => {
    setBody(`
      <div id="picker" class="lang">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    const picker = document.getElementById('picker')!;
    expect(picker.style.display).toBe('none');
    expect(picker.getAttribute('data-movar-hidden')).toBe('single-option');
  });

  it('collapses the electrica-shop picker to nothing', () => {
    setBody(`
      <ul>
        <li id="header-languages">
          <a href="/ua/error404.htm" class="ua-link" title="Украинский язык">українською</a>
          <span class="divider">&nbsp;</span>
          <span class="ru-link" title="Русский язык">по-русски</span>
        </li>
      </ul>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.querySelector('.ru-link')!.getAttribute('style')).toContain('display: none');
    expect(document.getElementById('header-languages')!.getAttribute('data-movar-hidden')).toBe(
      'single-option',
    );
  });

  it('leaves the container visible when multiple languages remain', () => {
    setBody(`
      <div id="picker">
        <a href="/ua/x">UA</a>
        <a href="/en/x">EN</a>
        <a href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.getElementById('picker')!.style.display).toBe('');
  });

  it('is idempotent across repeated calls', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const first = filterPickers(findLanguagePickers(), ['uk', 'en']);
    const second = filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(first.hiddenLinks).toHaveLength(1);
    expect(second.hiddenLinks).toHaveLength(0);
    expect(second.hiddenContainers).toHaveLength(0);
  });
});

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
    expect(pickRedirectTarget(pickers, ['uk', 'en'])?.id).toBe('ua');
    expect(pickRedirectTarget(pickers, ['en', 'uk'])?.id).toBe('en');
  });

  it('skips non-anchor classified elements (no href to follow)', () => {
    setBody(`
      <li id="header-languages">
        <a id="ua" href="/ua/x" class="ua-link">українською</a>
        <span class="ru-link">по-русски</span>
      </li>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('ua');
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
