import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detachAllTooltips } from './tooltip';
import {
  classifyLanguageElement,
  detectPageLanguage,
  filterPickers,
  findLanguagePickers,
  pickRedirectTarget,
} from './picker';
import {
  setBody,
  setup001ComUaPicker,
  setupTwoLanguagePicker,
  setupFlagPickerUA_RU,
  setupDeeplyNestedPicker,
  setupSelectPicker,
  expectContainerCurtained,
} from './picker.test-utils';

function elFromHtml<T extends HTMLElement>(html: string): T {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  document.body.append(div);
  return div.firstElementChild as T;
}

/**
 * Asserts that the currently-set DOM yields exactly one picker via
 * `findLanguagePickers` and that its classified languages match the
 * expected set (order-independent). Body setup is the caller's job — by
 * the time this runs, `setBody` / `setup*` helpers must already have
 * populated the document. Folds the three-line findLanguagePickers →
 * length → languages assertion that several tests repeat verbatim.
 */
function expectSinglePickerWithLangs(expected: readonly string[]): void {
  const pickers = findLanguagePickers();
  expect(pickers).toHaveLength(1);
  expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual([...expected].sort());
}

/**
 * Runs `setupTwoLanguagePicker(containerAttrs)`, applies a UK+EN filter,
 * and asserts the resulting container went `display:none`. Returns the
 * picker element so callers can chain curtain / restore assertions. Two
 * filterPickers tests share this five-line preamble; folding it keeps
 * each test focused on what it's actually verifying.
 */
function setupTwoLangPickerAndFilter(containerAttrs: string): HTMLElement {
  setupTwoLanguagePicker({ containerAttrs });
  filterPickers(findLanguagePickers(), ['uk', 'en']);
  const picker = document.querySelector<HTMLElement>('#picker')!;
  expect(picker.style.display).toBe('none');
  return picker;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

afterEach(() => {
  // Tooltips append hosts to document.body; clear them so cross-test
  // pollution doesn't leak ghost hosts into the next setBody().
  detachAllTooltips();
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

  it('classifies a bare-text leaf with a visual separator ("UA  |  ")', () => {
    // 001.com.ua-style: the active language sits in a leaf span next to its
    // sibling switch anchor, with the "|" baked into the same text node.
    const s = elFromHtml<HTMLSpanElement>('<span>UA&nbsp;&nbsp;|&nbsp;&nbsp;</span>');
    expect(classifyLanguageElement(s)?.language).toBe('uk');
  });

  it('does not classify a multi-child container by its joined text "UA | RU"', () => {
    // A container of inline labels must not classify as one of them; that
    // would shadow per-child classification in classifyContainerChildren.
    const wrap = elFromHtml<HTMLDivElement>(
      '<div><span>UA</span> | <a href="?lang=ru">RU</a></div>',
    );
    expect(classifyLanguageElement(wrap)).toBeNull();
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

  it('finds the 001.com.ua picker (bare-text active language + single switch anchor)', () => {
    // Real-world shape: <span>UA  |  </span><a href="?lang=ru">RU</a>
    // The active language sits in one text node with a "|" separator baked
    // into the span; only the RU anchor matches the seed selectors directly.
    // Detection needs (a) a 1-seed walk and (b) separator-split tokenisation
    // of the leaf span's text to recover "UA" → uk.
    setup001ComUaPicker();
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.container.id).toBe('header-languages');
    expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
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

  it('finds a picker where the Russian link classifies via title="Російська мова" alone', () => {
    // Common pattern on Ukraine-targeted CS-Cart/OpenCart templates: the
    // language switch ships ONLY a UA-language exonym title attribute —
    // no `ru-link` class, no localised text, no language-coded URL. The
    // electrica-shop case above survives because its Russian link also
    // carries `class="ru-link"` and `по-русски` as text; a template that
    // omits either of those leaves the title as the sole signal. Drop
    // the UA-exonym aliases from the table and this test fails — that's
    // the gap this guards against silently reopening.
    setBody(`
      <div id="picker">
        <a href="/switch" title="Українська мова">сюди</a>
        <a href="/change" title="Російська мова">туди</a>
      </div>
    `);
    expectSinglePickerWithLangs(['ru', 'uk']);
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
    setupFlagPickerUA_RU();
    expectSinglePickerWithLangs(['ru', 'uk']);
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
    expect(document.querySelector<HTMLElement>('#ua')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#de')!.style.display).toBe('none');
  });

  it('hides the whole container when only one language remains and attaches a curtain', () => {
    const picker = setupTwoLangPickerAndFilter('id="picker" class="lang"');
    // The curtain host is inserted as the immediate previous sibling.
    const host = picker.previousElementSibling as HTMLElement | null;
    expect(host?.getAttribute('data-movar-curtain')).toBe('');
    expect(host?.dataset['movarKind']).toBe('picker-container');
  });

  it('collapses the 001.com.ua picker (hides RU, leaves container visible in blocked-only mode)', () => {
    // Blocked-only mode strips the blocked entries and trusts the user's
    // own choice for what survives — even when only one option remains, we
    // don't curtain the container. Curtaining is reserved for the strict
    // legacy mode (keep-only, no `blocked`), where ≤1 survivor means the
    // user's priority list collapsed and the chip explains why.
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('');
    expect(container.previousElementSibling).toBeNull();
  });

  it('collapses the 001.com.ua picker in strict mode (hides RU, curtains the container)', () => {
    // Same setup as above but without `blocked` — keep-only semantics, so
    // RU falls outside the keep list and the container is curtained when
    // UK is the lone survivor.
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    expectContainerCurtained('#header-languages');
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
    expect(document.querySelector<HTMLElement>('.ru-link')!.getAttribute('style')).toContain(
      'display: none',
    );
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('none');
    expect((container.previousElementSibling as HTMLElement | null)?.dataset['movarKind']).toBe(
      'picker-container',
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
    expect(document.querySelector<HTMLElement>('#picker')!.style.display).toBe('');
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

  it('does NOT treat a same-language cluster as a picker (Google SERP hl=uk propagation)', () => {
    // Google search results carry ?hl=uk on EVERY internal link, so every
    // anchor in a result block classifies as "uk". That cluster is not a
    // language picker — picker semantics require a CHOICE between languages.
    setBody(`
      <div id="results">
        <a href="https://www.google.com/url?q=https://x.com&amp;hl=uk">Result A</a>
        <a href="https://www.google.com/url?q=https://y.com&amp;hl=uk">Result B</a>
        <a href="https://www.google.com/url?q=https://z.com&amp;hl=uk">Result C</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(0);
    const result = filterPickers(pickers, ['uk']);
    expect(result.hiddenContainers).toHaveLength(0);
    // No curtain should be attached.
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('finds the real picker and ignores a same-language cluster on the same page', () => {
    // Mirrors the actual production shape that surfaced the bug: a Google SERP
    // where every result link carries ?hl=uk (false-positive cluster), PLUS
    // a legitimate language switcher in the header. Detection must isolate
    // the real picker and leave the result block untouched.
    setBody(`
      <header>
        <div id="lang-picker">
          <a href="?hl=uk">UA</a>
          <a href="?hl=en">EN</a>
          <a href="?hl=ru">RU</a>
        </div>
      </header>
      <main>
        <div id="results">
          <a href="/url?q=https://a.com&amp;hl=uk">Result A</a>
          <a href="/url?q=https://b.com&amp;hl=uk">Result B</a>
          <a href="/url?q=https://c.com&amp;hl=uk">Result C</a>
        </div>
      </main>
    `);
    const pickers = findLanguagePickers();
    expect(pickers.map((p) => p.container.id)).toEqual(['lang-picker']);

    filterPickers(pickers, ['uk']);
    const langPicker = document.querySelector<HTMLElement>('#lang-picker')!;
    const results = document.querySelector<HTMLElement>('#results')!;

    // Real picker collapsed (uk remains, en + ru hidden, container curtained).
    expect(langPicker.style.display).toBe('none');
    expect((langPicker.previousElementSibling as HTMLElement | null)?.dataset['movarKind']).toBe(
      'picker-container',
    );

    // Result block is untouched — no curtain, no display:none.
    expect(results.style.display).toBe('');
    expect(results.previousElementSibling).toBeNull();
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
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

describe('detectPageLanguage — subdomain', () => {
  // ru.example.com / ua.example.com is one of the most common multilingual
  // patterns and currently slips past detection entirely.
  it('reads a language-coded subdomain (ru.example.com)', () => {
    const loc = { pathname: '/about', hostname: 'ru.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
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
});

describe('findLanguagePickers — Shadow DOM', () => {
  it('discovers pickers rendered inside an open shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div class="lang">
        <a href="/ua/foo">UA</a>
        <a href="/ru/foo">RU</a>
      </div>
    `;
    const pickers = findLanguagePickers();
    expect(pickers.length).toBeGreaterThan(0);
    expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual(['ru', 'uk']);
  });
});

describe('findLanguagePickers — native <select>', () => {
  it('detects a <select> language picker via its <option>s', () => {
    setupSelectPicker();
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.container.tagName).toBe('SELECT');
    expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual(['en', 'ru', 'uk']);
  });

  it('hides <option> entries not in keep', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);
  });
});

describe('findLanguagePickers — camelCase / packed class tokens', () => {
  // Text content is neutral so the camelCase class is the only signal.
  it('classifies "langRu" without a separator', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="langRu">click</span>');
    expect(classifyLanguageElement(s)?.language).toBe('ru');
  });

  it('classifies "menuLangUk" with a noise prefix', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="menuLangUk">click</span>');
    expect(classifyLanguageElement(s)?.language).toBe('uk');
  });
});

describe('findLanguagePickers — flag-emoji-only labels', () => {
  it('classifies a flag-emoji-only link without any other label', () => {
    // Visible label is only the flag emoji codepoint — no text, no aria, no class hint.
    const a = elFromHtml<HTMLAnchorElement>('<a href="#" class="lang">🇷🇺</a>');
    expect(classifyLanguageElement(a)?.language).toBe('ru');
  });
});

describe('findLanguagePickers — per-region dedup', () => {
  it('collapses multiple en-* entries into one EN link', () => {
    setBody(`
      <div id="picker" class="lang">
        <a href="/uk/x" hreflang="uk">UA</a>
        <a href="/en-US/x" hreflang="en-US">English (US)</a>
        <a href="/en-GB/x" hreflang="en-GB">English (UK)</a>
        <a href="/en-AU/x" hreflang="en-AU">English (AU)</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    const enLinks = pickers[0]!.links.filter((l) => l.language === 'en');
    expect(enLinks).toHaveLength(1);
  });
});

describe('findLanguagePickers — deeper nesting', () => {
  it('discovers pickers when each item is wrapped in more than 6 levels', () => {
    // Common framework pattern: each picker item lives in many wrappers
    // (Headless UI / Radix / etc.) before reaching the shared container.
    setupDeeplyNestedPicker();
    expectSinglePickerWithLangs(['ru', 'uk']);
  });
});

describe('filterPickers — keep semantics: empty priority', () => {
  it('does not hide everything when keep is empty', () => {
    // Defensive: an empty `keep` set means "user removed their priority list",
    // not "hide every language picker on the page".
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), []);
    expect(result.hiddenLinks).toHaveLength(0);
    expect(result.hiddenContainers).toHaveLength(0);
  });
});

describe('filterPickers — container curtain detach restores display', () => {
  it("restores the site's own inline display when the user shows the picker again", () => {
    // Pickers commonly use display:flex inline; the curtain sets display:none.
    // Detaching the curtain reinstates the original so the picker doesn't
    // lose its layout after restore.
    const picker = setupTwoLangPickerAndFilter('id="picker" style="display: flex"');
    const host = picker.previousElementSibling as HTMLElement;
    const restoreBtn = host.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
    restoreBtn.click();

    expect(picker.style.display).toBe('flex');
  });

  it('clears display entirely on restore when no inline style was present', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    const picker = document.querySelector<HTMLElement>('#picker')!;
    const host = picker.previousElementSibling as HTMLElement;
    host.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
    expect(picker.style.display).toBe('');
  });
});

describe('filterPickers — tolerated languages', () => {
  it('does not hide a non-blocked language that is also outside priority', () => {
    // User has priority=['uk','en'] and blocked=['ru']. A picker with UA/EN/PL/RU
    // should keep PL visible (Polish is not in priority but the user did not
    // ask for it to be blocked either).
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
        <a id="pl" href="/pl/x">PL</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const hidden = result.hiddenLinks.map((l) => l.language);
    expect(hidden).toEqual(['ru']);
    expect(document.querySelector<HTMLElement>('#pl')!.style.display).toBe('');
  });
});

describe('filterPickers — useless delimiter cleanup', () => {
  // Stranded `|`, `·`, and explicit divider spans are visual noise once the
  // language link they bracket is hidden. The cleanup runs in both modes
  // (strict and blocked-only); we test in blocked-only because that's the
  // production default and the case where the container itself stays.

  it('hides an explicit divider span between two visible-then-hidden links (electrica-shop)', () => {
    setBody(`
      <ul>
        <li id="header-languages">
          <a href="/ua/x" class="ua-link" title="Украинский язык">українською</a>
          <span class="divider">&nbsp;</span>
          <span class="ru-link" title="Русский язык">по-русски</span>
        </li>
      </ul>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.ru-link')!.style.display).toBe('none');
    const divider = document.querySelector<HTMLElement>('.divider')!;
    expect(divider.style.display).toBe('none');
    expect(divider.getAttribute('data-movar-hidden')).toBe('useless-delimiter');
  });

  it('hides the trailing divider when the last link is hidden', () => {
    // EN | UA | RU → block RU → "EN | UA" (only the divider before RU hides).
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe(''); // EN | UA — both visible, keep
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — RU hidden, hide
  });

  it('hides the leading divider when the first link is hidden', () => {
    // EN | UA | RU → block EN → "UA | RU".
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: ['en'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe('none'); // EN | UA — EN hidden, hide
    expect(seps[1]!.style.display).toBe(''); // UA | RU — both visible, keep
  });

  it('hides both dividers around a middle hidden link', () => {
    // EN | UA | RU → block UA → "EN  RU" with both dividers hidden.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['en', 'ru'], { blocked: ['uk'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe('none');
    expect(seps[1]!.style.display).toBe('none');
  });

  it('detects bare-text dividers (span containing only "·" or "|")', () => {
    // No "divider" class, just a leaf element whose text is pure separator.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="bullet">·</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.bullet')!.style.display).toBe('none');
  });

  it('leaves dividers alone when no links were hidden', () => {
    // Cheap-path guarantee: a no-op filter must not touch the dividers.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: [] });
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('');
  });

  it('does not classify a content span whose text is not pure-separator', () => {
    // Defensive: a span like "(beta)" or "3 languages" sitting in a picker
    // container should never be classified as a divider, even if a
    // neighbouring link is hidden.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="info">(beta)</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.info')!.style.display).toBe('');
  });
});

describe('filterPickers — bare-text orphan separator trimming', () => {
  // The 001.com.ua-style picker bakes the active language and its visual
  // separator into one text node: `<span>UA  |  </span><a>RU</a>`. When
  // RU is hidden, the trailing `|` in the UA span becomes a stranded
  // character that element-level hides can't reach.

  it('trims a trailing orphan `|` from the surviving 001.com.ua active-language span', () => {
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    // Capture the original text so the assertion documents what we expect
    // to trim down from — including the &nbsp; padding that real sites use.
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    expect(activeSpan.textContent).toBe('UA  |  ');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    expect(activeSpan.textContent).toBe('UA');
    // Original text snapshotted on the element for clearAllModifications.
    expect(activeSpan.getAttribute('data-movar-original-text')).toBe('UA  |  ');
  });

  it('trims a leading orphan `|` when the hidden sibling is on the left', () => {
    // Mirror layout: <a>RU</a><span>  |  UA</span>.
    setBody(`
      <li id="header-languages" class="switch-lang">
        <a id="ru-link" href="https://example.com/?lang=ru">RU</a><span>&nbsp;&nbsp;|&nbsp;&nbsp;UA</span>
      </li>
    `);
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(activeSpan.textContent).toBe('UA');
  });

  it('does not trim when no sibling is hidden', () => {
    // Defensive: a picker where nothing gets filtered must leave the leaf
    // text untouched, no matter how many separator chars it contains.
    setup001ComUaPicker();
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: [] });
    expect(activeSpan.textContent).toBe('UA  |  ');
    expect(activeSpan.hasAttribute('data-movar-original-text')).toBe(false);
  });

  it('does not trim when the surviving link is inside a chip-curtained container', () => {
    // Strict mode: 1 survivor → container gets a chip curtain → in-container
    // cleanup is skipped so the chip's click-to-restore returns the picker
    // exactly as the site rendered it.
    setup001ComUaPicker();
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'en']); // strict mode
    // Container is curtained (chip sibling-before, container display:none).
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('none');
    // Span text is untouched — the curtain hides the whole container, and
    // detaching the curtain must restore the picker verbatim.
    expect(activeSpan.textContent).toBe('UA  |  ');
    expect(activeSpan.hasAttribute('data-movar-original-text')).toBe(false);
  });
});

function getTooltipHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-movar-tooltip]')];
}

describe('filterPickers — survivor hover tooltip', () => {
  // Every surviving classified link in a picker where Movar hid something
  // gets a shadow-rooted tooltip (host appended to document.body, marked
  // `data-movar-tooltip`). The tooltip carries title + body listing
  // endonyms + a "Show hidden options" action that restores the picker
  // in place. Skipped when the whole container will be chip-curtained.

  it('attaches one tooltip host per surviving link in a multi-survivor picker', () => {
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // Two visible links → two tooltip hosts.
    expect(getTooltipHosts()).toHaveLength(2);
  });

  it('attaches a tooltip on the surviving 001.com.ua active-language span', () => {
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(1);
    const shadow = getTooltipHosts()[0]!.shadowRoot!;
    // Endonym for Russian appears in the body of the tooltip.
    expect(shadow.querySelector('.body')?.textContent?.toLowerCase()).toContain('русск');
  });

  it('lists every currently-hidden language in original picker order', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'de'] });
    const shadow = getTooltipHosts()[0]!.shadowRoot!;
    const bodyText = (shadow.querySelector('.body')?.textContent ?? '').toLowerCase();
    expect(bodyText).toContain('русск');
    expect(bodyText).toContain('deutsch');
    expect(bodyText.indexOf('русск')).toBeLessThan(bodyText.indexOf('deutsch'));
  });

  it('the action button restores the picker in place (per-picker scope)', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');
    // Force-open the tooltip so the action button is reachable.
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.dispatchEvent(new FocusEvent('focus'));
    const action = getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!;
    action.click();
    // Hidden link is back, container is marked restored, tooltip is gone.
    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(container.hasAttribute('data-movar-restored')).toBe(true);
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('subsequent filterPickers calls skip a restored container', () => {
    // MutationObserver re-firing must not undo a per-picker restore.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.dispatchEvent(new FocusEvent('focus'));
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // Re-run the filter — equivalent to a MutationObserver tick.
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('restores hidden delimiters and trimmed text inside the picker', () => {
    // electrica-shop style: ru-link sibling-of <span class="divider">.
    // After in-place restore, both the link and the divider come back.
    setBody(`
      <li id="header-languages">
        <a href="/ua/x" class="ua-link">українською</a>
        <span class="divider">&nbsp;</span>
        <span class="ru-link">по-русски</span>
      </li>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.divider')!.style.display).toBe('none');
    // Open + click restore on the UA-link tooltip.
    const ua = document.querySelector<HTMLAnchorElement>('.ua-link')!;
    ua.dispatchEvent(new FocusEvent('focus'));
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
    expect(document.querySelector<HTMLElement>('.divider')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('.ru-link')!.style.display).toBe('');
  });

  it('does not attach a tooltip when nothing was hidden', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('does not attach a tooltip when the container is chip-curtained (strict mode)', () => {
    // Strict mode + ≤1 survivor → chip curtain hides the whole container.
    // The chip carries the explanation; surviving link is untouched.
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk']);
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('filterPickers — blocked-only mode never curtains the container', () => {
  // The "alternative behaviour" pinned in the design grill: when the caller
  // passes `options.blocked`, the picker just loses its blocked entries —
  // even a single surviving link stays visible as a normal picker. The
  // chip overlay is reserved for the strict keep-only path where the
  // user's priority list collapsed it to nothing.

  it('leaves container visible when one survivor remains after blocking', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(result.hiddenContainers).toHaveLength(0);
    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(container.style.display).toBe('');
    expect(container.previousElementSibling).toBeNull();
  });

  it('leaves container visible even when ALL languages are blocked (zero survivors)', () => {
    // Page is EN, picker offers EN/RU, user blocks both. In strict mode this
    // would trigger a sigil-only chip; in blocked-only mode we keep the (now
    // empty) container — the consent wall handles the real consent-and-bypass
    // UX when the user actively tries to switch.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['en', 'ru'] });
    expect(result.hiddenContainers).toHaveLength(0);
    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(container.style.display).toBe('');
    expect(container.previousElementSibling).toBeNull();
  });
});

describe('filterPickers — container curtain uses chip skin', () => {
  it('renders the surviving language endonym as the chip label', () => {
    // Strict keep-only mode collapses UA/RU to just UA — the chip should
    // surface "Українська" so the user reads the result as "you're sorted,
    // here's the language we settled on."
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk']);
    const host = document.querySelector<HTMLElement>('#picker')!
      .previousElementSibling as HTMLElement;
    expect(host.dataset['skin']).toBe('chip');
    // jsdom ships the CLDR data for the languages we test against, so the
    // endonym lookup is deterministic; first letter casing varies by impl,
    // hence the lowercase comparison.
    const label = host.shadowRoot!.querySelector('.chip__label')?.textContent ?? '';
    expect(label.toLowerCase()).toContain('українськ');
  });

  it('renders sigil-only (no label span) when zero languages survive', () => {
    // Strict mode + every language outside keep → the chip has no language
    // to name. The icon stays as the Movar signal; the label node is omitted.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk']);
    const host = document.querySelector<HTMLElement>('#picker')!
      .previousElementSibling as HTMLElement;
    expect(host.dataset['skin']).toBe('chip');
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('.chip__label')).toBeNull();
    expect(shadow.querySelector('.chip__icon')).not.toBeNull();
    // aria-label still carries the explanation copy.
    expect(shadow.querySelector('.chip')?.getAttribute('aria-label')).toMatch(/Movar/i);
  });

  it('the whole chip is the restore button — clicking it detaches the curtain', () => {
    setupTwoLanguagePicker({ containerAttrs: 'id="picker" style="display: flex"' });
    filterPickers(findLanguagePickers(), ['uk']);
    const picker = document.querySelector<HTMLElement>('#picker')!;
    expect(picker.style.display).toBe('none');

    const host = picker.previousElementSibling as HTMLElement;
    const chip = host.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!;
    chip.click();

    expect(picker.style.display).toBe('flex');
    expect(picker.previousElementSibling).toBeNull();
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
