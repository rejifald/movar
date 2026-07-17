import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from './extract';
import { setBody, setupDeeplyNestedPicker } from './picker.test-utils';

describe('findLanguagePickers — real-world DOM shapes', () => {
  it('pierces an open shadow root to find a picker (component-library switchers)', () => {
    // Shoelace/Lit/etc. render the whole switcher inside a custom element's
    // shadow root; a light-DOM-only querySelectorAll would miss it entirely.
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="picker"><a href="/ua/x">UA</a><a href="/ru/x">RU</a></div>';
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('does not treat a same-language link cluster as a picker (Google-SERP ?hl= propagation)', () => {
    // A picker offers a CHOICE between languages. Three links that all classify
    // as the same language — e.g. ?hl=uk propagated into every result link — is
    // not a switcher; the ≥2-distinct-languages guard must reject it.
    setBody(
      '<div id="results"><a href="/a?hl=uk">A</a><a href="/b?hl=uk">B</a><a href="/c?hl=uk">C</a></div>',
    );
    expect(findLanguagePickers()).toHaveLength(0);
  });

  it('finds a picker whose items are nested many levels deep (Headless UI / Radix wrappers)', () => {
    // Modern component libraries wrap each item 8+ levels before the shared
    // container; the ancestor walk must climb far enough (MAX_PICKER_DEPTH).
    setupDeeplyNestedPicker();
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('detects a UMI.CMS "UKR / RU" switcher (Ukrainian entry has only its "UKR" text)', () => {
    // ds-electronics.com.ua shape: the Ukrainian link is the prefix-less URL
    // labelled "UKR" (three-letter ISO code, no /uk/ or /ua/ path segment), so
    // its ONLY language signal is that text. Before the langtell `ukr`→uk gap
    // was filled, that entry didn't classify, the container held a single
    // language, and the ≥2-distinct guard dropped the whole switcher.
    setBody(`
      <div class="lang">
        <a class="lang__link" href="/rele/">UKR</a>
        <a class="lang__link lang__link_active" href="/ru/rele/">RU</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('still finds the picker when <html> carries page-locale metadata (UMI.CMS `data-lang` root marker)', () => {
    // ds-electronics.com.ua (and the UMI.CMS class generally) stamps
    // `data-lang="ru"` on <html> as page metadata — unrelated to the picker
    // widget. `[data-lang]` is a SEED_SELECTORS entry meant for picker items,
    // so <html> used to get seeded and classified too. Being the ancestor of
    // every other classified element on the page, dedupNested's "keep only
    // outer elements" rule then discarded the real picker in favor of <html>
    // itself — which has no parent to walk a container search from, so
    // findLanguagePickers silently returned zero pickers.
    document.documentElement.setAttribute('data-lang', 'ru');
    document.documentElement.setAttribute('data-lang-prefix', '/ru');
    setBody(`
      <div class="lang">
        <a class="lang__link" href="/rele/">UKR</a>
        <a class="lang__link lang__link_active" href="/ru/rele/">RU</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
    // <html> itself must never surface as a picker link.
    expect(pickers[0]!.links.some((l) => l.el === document.documentElement)).toBe(false);
  });

  it('still finds the picker when <body> carries the same kind of page-locale metadata', () => {
    document.body.setAttribute('data-lang', 'ru');
    setBody(`
      <div class="lang">
        <a class="lang__link" href="/rele/">UKR</a>
        <a class="lang__link lang__link_active" href="/ru/rele/">RU</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });
});
