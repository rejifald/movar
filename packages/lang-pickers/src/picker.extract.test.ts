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
});
