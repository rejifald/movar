import { getProfiles } from '@movar/lang-detect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPageDiagnostics, highlightNode } from './page-diagnostics';

const candidates = getProfiles(['uk', 'ru']);
const blocked = new Set(['ru']);

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no matchMedia; the page-mode chain needs it (prefers-color-scheme).
  globalThis.matchMedia = vi.fn(() => ({
    matches: false,
  })) as unknown as typeof globalThis.matchMedia;
});

describe('buildPageDiagnostics', () => {
  it('runs the product picker model and flags blocked / active languages', () => {
    // Known-good shape from the product's own findLanguagePickers tests.
    document.body.innerHTML = `
      <div id="picker" class="lang">
        <a href="https://example.com/ua/foo">UA</a>
        <a href="https://example.com/ru/foo">RU</a>
      </div>
    `;
    const snap = buildPageDiagnostics({
      candidates,
      blocked,
      host: 'example.com',
      href: 'https://example.com/ua/foo',
    });

    // example.com has no content extractor (Google/YouTube only).
    expect(snap.extractor).toBeNull();
    expect(snap.cards).toHaveLength(0);

    expect(snap.pickers).toHaveLength(1);
    const langs = snap.pickers[0]!.languages;
    expect(langs.map((l) => l.code).toSorted()).toEqual(['ru', 'uk']);
    expect(langs.find((l) => l.code === 'ru')?.blocked).toBe(true);
    expect(langs.find((l) => l.code === 'uk')?.blocked).toBe(false);
    // One blocked option (ru) → the FAB badge count.
    expect(snap.blockedCount).toBe(1);
  });

  it('marks the active language from the current URL', () => {
    document.body.innerHTML = `
      <div id="picker" class="lang">
        <a href="https://example.com/ua/foo">UA</a>
        <a href="https://example.com/ru/foo">RU</a>
      </div>
    `;
    const snap = buildPageDiagnostics({
      candidates,
      blocked,
      host: 'example.com',
      href: 'https://example.com/ua/foo',
    });
    const uk = snap.pickers[0]!.languages.find((l) => l.code === 'uk');
    expect(uk?.active).toBe(true);
  });

  it('detects page mode and page language from the product chains', () => {
    document.body.innerHTML = `
      <div id="picker" class="lang">
        <a href="https://example.com/ua/foo">UA</a>
        <a href="https://example.com/ru/foo">RU</a>
      </div>
    `;
    const snap = buildPageDiagnostics({
      candidates,
      blocked,
      host: 'example.com',
      href: 'https://example.com/ua/foo',
      loc: { pathname: '/ua/foo', hostname: 'example.com', href: 'https://example.com/ua/foo' },
    });

    // No theme signals in the DOM → prefers-color-scheme fallback (mocked light).
    expect(snap.pageMode?.verdict).toBe('light');
    expect(snap.pageMode?.decidedBy).toBe('prefers-color-scheme');

    // Active picker (uk, the current /ua/ URL) wins the page-language chain.
    expect(snap.pageLanguage.verdict).toBe('uk');
    expect(snap.pageLanguage.signals.find((s) => s.label === 'active picker')?.value).toBe('uk');
    expect(snap.pageLanguage.blocked).toBe(false);
  });

  it('returns an empty snapshot on a page with no model and no picker', () => {
    document.body.innerHTML = `<p>Just some prose, no switcher and no result cards.</p>`;
    const snap = buildPageDiagnostics({
      candidates,
      blocked,
      host: 'example.com',
      href: undefined,
    });
    expect(snap.extractor).toBeNull();
    expect(snap.cards).toHaveLength(0);
    expect(snap.pickers).toHaveLength(0);
    expect(snap.blockedCount).toBe(0);
  });

  it('highlightNode flashes a picker element by id; false for an unknown id', () => {
    document.body.innerHTML = `
      <div id="picker" class="lang">
        <a href="https://example.com/ua/foo">UA</a>
        <a href="https://example.com/ru/foo">RU</a>
      </div>
    `;
    const snap = buildPageDiagnostics({
      candidates,
      blocked,
      host: 'example.com',
      href: 'https://example.com/ua/foo',
    });
    const id = snap.pickers[0]!.languages[0]!.id;
    expect(highlightNode(id)).toBe(true);
    expect(document.querySelector('[data-movar-highlight]')).not.toBeNull();
    expect(highlightNode('nope')).toBe(false);
    for (const o of document.querySelectorAll('[data-movar-highlight]')) o.remove();
  });
});
