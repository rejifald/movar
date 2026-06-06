import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Widget } from './Widget';
import { EMPTY_DIAGNOSTICS } from '../types';
import type { PageDiagnostics } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A Google-SERP-shaped snapshot: two result cards (one blocked Russian, one
 *  kept Ukrainian), a picker offering uk/ru with ru blocked, dark page mode, and
 *  a blocked-ru page language. blockedCount=2. */
const SNAP: PageDiagnostics = {
  extractor: 'google',
  cards: [
    {
      id: 'n1',
      kind: 'result',
      language: 'ru',
      rung: '2a',
      margin: 1,
      blocked: true,
      francAgree: true,
      francLanguage: 'ru',
      sample: 'Последние новости часа: что произошло в мире',
    },
    {
      id: 'n2',
      kind: 'result',
      language: 'uk',
      rung: 1,
      margin: 2,
      blocked: false,
      francAgree: null,
      francLanguage: null,
      sample: 'Останні новини України сьогодні',
    },
  ],
  cardLangCounts: { ru: 1, uk: 1 },
  pickers: [
    {
      id: 'n3',
      activeLanguage: 'uk',
      languages: [
        { id: 'n4', code: 'uk', blocked: false, active: true },
        { id: 'n5', code: 'ru', blocked: true, active: false },
      ],
    },
  ],
  pageMode: {
    verdict: 'dark',
    decidedBy: 'color-scheme attribute',
    signals: [
      { label: 'color-scheme attribute', value: 'dark' },
      { label: 'theme-color meta', value: null },
      { label: 'computed background', value: null },
      { label: 'prefers-color-scheme', value: 'light' },
    ],
  },
  pageLanguage: {
    verdict: 'ru',
    blocked: true,
    signals: [
      { label: 'active picker', value: 'ru' },
      { label: '<html lang>', value: null },
      { label: 'subdomain', value: null },
      { label: 'path segment', value: null },
      { label: 'self hreflang', value: null },
    ],
  },
  blockedCount: 2,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(ui: ReactElement): void {
  act(() => {
    root.render(ui);
  });
}
function click(el: Element | null): void {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
const fab = (): HTMLButtonElement | null =>
  container.querySelector('button[aria-label^="Movar Diagnostics —"]');
function clickTab(label: string): void {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((t) =>
    t.textContent.includes(label),
  );
  click(tab ?? null);
}
/** Set a controlled <input> value the way React expects (native setter + input event). */
function setNumberInput(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const noHighlight = (): boolean => true;

describe('Widget', () => {
  it('badges the FAB with the would-block count and starts closed', () => {
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={() => {}} />);
    expect(fab()?.getAttribute('aria-label')).toBe('Movar Diagnostics — 2 would block');
    expect(fab()?.textContent).toContain('2');
    expect(container.querySelector('section[aria-label="Movar Diagnostics"]')).toBeNull();
  });

  it('opens on the Content tab showing classified cards', () => {
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={() => {}} />);
    click(fab());
    const panel = container.querySelector('section[aria-label="Movar Diagnostics"]');
    expect(panel).not.toBeNull();
    const text = panel?.textContent ?? '';
    expect(text).toContain('google'); // extractor label
    expect(text).toContain('Russian');
    expect(text).toContain('block'); // blocked badge on the ru card
    expect(text).toContain('Последние новости часа: что произошло в мире');
    // Only the active (Content) tab's cards render — the picker is on its own tab.
    expect(panel?.querySelectorAll('li')).toHaveLength(2);
  });

  it('switches to the Pickers tab', () => {
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={() => {}} />);
    click(fab());
    clickTab('Pickers');
    const panel = container.querySelector('section[aria-label="Movar Diagnostics"]');
    expect(panel?.querySelectorAll('li')).toHaveLength(1); // one picker row
    expect(panel?.textContent).toContain('Ukrainian');
    expect(panel?.textContent).toContain('Russian');
  });

  it('shows page mode on the Page mode tab', () => {
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={() => {}} />);
    click(fab());
    clickTab('Page mode');
    const text =
      container.querySelector('section[aria-label="Movar Diagnostics"]')?.textContent ?? '';
    expect(text.toLowerCase()).toContain('dark');
    expect(text).toContain('decided by color-scheme attribute');
  });

  it('shows page language + blocked on the Page lang tab', () => {
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={() => {}} />);
    click(fab());
    clickTab('Page lang');
    const text =
      container.querySelector('section[aria-label="Movar Diagnostics"]')?.textContent ?? '';
    expect(text).toContain('Russian');
    expect(text).toContain('blocked');
    expect(text).toContain('active picker');
  });

  it('shows an empty state when the models found nothing', () => {
    render(<Widget snapshot={EMPTY_DIAGNOSTICS} onHighlight={noHighlight} onRefresh={() => {}} />);
    expect(fab()?.textContent.trim()).toBe(''); // no badge
    click(fab());
    expect(container.textContent).toContain('No content model for this site');
  });

  it('wires the card highlight button to onHighlight with the node id and default gutter', () => {
    const onHighlight = vi.fn(() => true);
    render(<Widget snapshot={SNAP} onHighlight={onHighlight} onRefresh={() => {}} />);
    click(fab());
    click(container.querySelector('button[aria-label="Show on page"]'));
    expect(onHighlight).toHaveBeenCalledWith('n1', 1); // 1rem default
  });

  it('passes the configurable gutter through to onHighlight', () => {
    const onHighlight = vi.fn(() => true);
    render(<Widget snapshot={SNAP} onHighlight={onHighlight} onRefresh={() => {}} />);
    click(fab());
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Highlight gutter (rem)"]',
    );
    expect(input).not.toBeNull();
    setNumberInput(input!, '2');
    click(container.querySelector('button[aria-label="Show on page"]'));
    expect(onHighlight).toHaveBeenCalledWith('n1', 2);
  });

  it('fires onRefresh from the header and closes via the close button', () => {
    const onRefresh = vi.fn();
    render(<Widget snapshot={SNAP} onHighlight={noHighlight} onRefresh={onRefresh} />);
    click(fab());
    click(container.querySelector('button[aria-label="Refresh"]'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    click(container.querySelector('button[aria-label="Close"]'));
    expect(container.querySelector('section[aria-label="Movar Diagnostics"]')).toBeNull();
  });
});
