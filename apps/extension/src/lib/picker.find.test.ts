import { describe, expect, it } from 'vitest';
import { filterPickers } from './lang-pickers/filter';
import { findLanguagePickers } from './lang-pickers/extract';
import {
  setBody,
  setup001ComUaPicker,
  setupFlagPickerUA_RU,
  setupDeeplyNestedPicker,
  setupSelectPicker,
  expectSinglePickerWithLangs,
} from './picker.test-utils';

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
    expect(picker.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
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
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
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
    expect(picker.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('finds a picker where the Russian link classifies via title="Російська мова" alone', () => {
    // Regression: UA-exonym aliases (Російська мова) must classify; removing those aliases
    // breaks templates that ship title= as the sole signal.
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
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['en', 'ru', 'uk']);
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
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('does not discover pickers inside a closed shadow root', () => {
    // `el.shadowRoot` returns null for closed roots, so the deep-walk skips
    // them by construction. A regression that started reaching for
    // `getRootNode` or similar would re-enable closed-root traversal and
    // break sites that intentionally hide their internals. Pin the
    // by-construction skip so any change to the walker has to face it.
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <div class="lang">
        <a href="/ua/foo">UA</a>
        <a href="/ru/foo">RU</a>
      </div>
    `;
    expect(findLanguagePickers()).toEqual([]);
  });
});

describe('findLanguagePickers — native <select>', () => {
  it('detects a <select> language picker via its <option>s', () => {
    setupSelectPicker();
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.container.tagName).toBe('SELECT');
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['en', 'ru', 'uk']);
  });

  it('hides <option> entries not in keep', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);
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
