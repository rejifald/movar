import { describe, expect, it } from 'vitest';
import { classifyLanguageElement } from './classify';
import { elFromHtml } from './picker.test-utils';

// ── by tag ───────────────────────────────────────────────────────────────────

describe('classifyLanguageElement — anchor URL signals', () => {
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

  it('strips BCP47 region suffix from hreflang', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="/x" hreflang="en-US">English</a>');
    expect(classifyLanguageElement(a)?.language).toBe('en');
  });

  it('returns null for non-language links', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/about">About us</a>');
    expect(classifyLanguageElement(a)).toBeNull();
  });

  it('does not throw on an unparseable href and returns null when nothing else classifies', () => {
    // A malformed href (here an invalid IPv6 host) makes `new URL()` throw;
    // classifyAnchor must catch it and fall through, never crash the DOM walk.
    const a = elFromHtml<HTMLAnchorElement>('<a href="http://[bad-host/foo">Switch</a>');
    expect(() => classifyLanguageElement(a)).not.toThrow();
    expect(classifyLanguageElement(a)).toBeNull();
  });
});

describe('classifyLanguageElement — select option', () => {
  it('classifies an <option> element via its value attribute (languageFromOptionValue)', () => {
    const select = elFromHtml<HTMLSelectElement>(
      '<select><option value="ru">Русский</option></select>',
    );
    const option = select.querySelector<HTMLOptionElement>('option')!;
    expect(classifyLanguageElement(option)?.language).toBe('ru');
  });
});

// ── by class / title / attribute ─────────────────────────────────────────────

describe('classifyLanguageElement — by class / title / attribute', () => {
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

  it('classifies "langRu" camelCase class without a separator', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="langRu">click</span>');
    expect(classifyLanguageElement(s)?.language).toBe('ru');
  });

  it('classifies "menuLangUk" camelCase class with a noise prefix', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="menuLangUk">click</span>');
    expect(classifyLanguageElement(s)?.language).toBe('uk');
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

  it('ignores noise class names', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="divider">&nbsp;</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });

  it('ignores unrelated 3-letter classes that are not language codes', () => {
    const s = elFromHtml<HTMLSpanElement>('<span class="big-link">Big</span>');
    expect(classifyLanguageElement(s)).toBeNull();
  });
});

// ── by content ────────────────────────────────────────────────────────────────

describe('classifyLanguageElement — by content', () => {
  it('classifies via short text "Українська" in an anchor', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="https://example.com/">Українська</a>');
    expect(classifyLanguageElement(a)?.language).toBe('uk');
  });

  it('classifies via three-letter text "UKR" with a prefix-less href (UMI.CMS)', () => {
    // The href (/rele/) carries no language segment, so the ISO 639-2/3
    // `ukr`→uk alias filling langtell's gap is the only thing that classifies it.
    const a = elFromHtml<HTMLAnchorElement>('<a href="/rele/">UKR</a>');
    expect(classifyLanguageElement(a)?.language).toBe('uk');
  });

  it('classifies an anchor by descendant <img alt>', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="#"><img src="/de.png" alt="Deutsch" /></a>');
    expect(classifyLanguageElement(a)?.language).toBe('de');
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

  it('classifies a flag-emoji-only link (🇷🇺)', () => {
    // Visible label is only the flag emoji codepoint — no text, no aria, no class hint.
    const a = elFromHtml<HTMLAnchorElement>('<a href="#" class="lang">🇷🇺</a>');
    expect(classifyLanguageElement(a)?.language).toBe('ru');
  });

  it('returns null for a flag emoji whose country code is not in COUNTRY_TO_LANG (🇯🇵 → JP)', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a href="#" class="lang">🇯🇵</a>');
    expect(classifyLanguageElement(a)).toBeNull();
  });

  it('does not classify a non-flag emoji (🤔 is not a regional-indicator pair)', () => {
    const a = elFromHtml<HTMLAnchorElement>('<a class="lang">🤔</a>');
    expect(classifyLanguageElement(a)).toBeNull();
  });

  it('does not classify a multi-child container by its joined text "UA | RU"', () => {
    // A container of inline labels must not classify as one of them; that
    // would shadow per-child classification in classifyContainerChildren.
    const wrap = elFromHtml<HTMLDivElement>(
      '<div><span>UA</span> | <a href="?lang=ru">RU</a></div>',
    );
    expect(classifyLanguageElement(wrap)).toBeNull();
  });

  it('ignores long text that happens to contain a language word', () => {
    const a = elFromHtml<HTMLAnchorElement>(
      '<a href="https://example.com/">Click here to switch language</a>',
    );
    expect(classifyLanguageElement(a)).toBeNull();
  });
});
