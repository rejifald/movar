import { afterEach, describe, expect, it } from 'vitest';
import { findLanguagePickers } from './extract';
import { findGateOverlay, MIN_GATE_COVERAGE } from './gate';
import type { GateViewport } from './gate';
import { setBody } from './picker.test-utils';

const VIEWPORT: GateViewport = { width: 1000, height: 800 };

/** jsdom has no layout — every `getBoundingClientRect` is a zero box — so the
 *  geometry half of gate detection has to be stubbed per element. Sizes are in
 *  the same units as `VIEWPORT`. */
function stubRect(el: Element, width: number, height: number, left = 0, top = 0): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
    }) as DOMRect;
}

/** The tradeport.ua «Оберіть мову / Выберите язык» interstitial, reduced to the
 *  structure that matters: a fixed full-viewport backdrop → panel → the two
 *  language anchors. The Ukrainian option's href is the current URL (it is a
 *  pure cookie-setter), which is what makes the redirect ladder unable to use
 *  it — see apps/extension/src/lib/language-switch.ts. */
function setupGate(): void {
  setBody(`
    <div id="backdrop" style="position:fixed;inset:0;z-index:99999;">
      <div id="panel">
        <p>Оберіть мову / Выберите язык</p>
        <p id="options">
          <a href="https://shop.example/ua/thing" class="btn btn-primary">Українська</a>
          <a href="https://shop.example/thing" class="btn btn-default">Русский</a>
        </p>
      </div>
    </div>
  `);
  const backdrop = document.querySelector('#backdrop');
  if (backdrop) stubRect(backdrop, VIEWPORT.width, VIEWPORT.height);
}

/** jsdom has no hit-testing either; stub the paint-order stack the browser
 *  would report at the picker's centre (topmost first). */
function stubHitStack(...ids: string[]): void {
  document.elementsFromPoint = (): Element[] =>
    ids.map((id) => document.getElementById(id)).filter((el) => el !== null);
}

/** solar-tech.com.ua's «Якою мовою Ви бажаєте переглянути наш сайт?» gate,
 *  reduced: a 505px-wide fixed column (`max-width` + `margin:auto`) holds
 *  the panel AND, as the panel's sibling, the full-viewport dim backdrop.
 *  Neither ancestor of the picker covers the viewport, so the ancestor walk
 *  alone misses it; the anchors' hrefs are plain links per language. */
function setupSiblingBackdropGate(): void {
  setBody(`
    <div id="column" style="position:fixed;inset:0;z-index:10;">
      <div id="dim" style="position:fixed;inset:0;z-index:2;"></div>
      <div id="panel" style="position:relative;">
        <div id="buttons">
          <a href="https://shop.example/thing" data-code="ru">Російська</a>
          <a href="https://shop.example/ua/thing" data-code="ua">Українська</a>
        </div>
      </div>
    </div>
  `);
  const column = document.querySelector('#column');
  const dim = document.querySelector('#dim');
  const buttons = document.querySelector('#buttons');
  if (column) stubRect(column, 505, VIEWPORT.height, 247, 0);
  if (dim) stubRect(dim, VIEWPORT.width, VIEWPORT.height);
  if (buttons) stubRect(buttons, 400, 67, 300, 400);
}

describe('findGateOverlay', () => {
  it('finds the fixed full-viewport backdrop above a gated picker', () => {
    setupGate();
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    // The picker container is the <p> holding the two anchors; the blocking
    // geometry lives two levels up on the backdrop.
    expect(picker.container.id).toBe('options');
    expect(findGateOverlay(picker, VIEWPORT)?.id).toBe('backdrop');
  });

  it('returns null for an ordinary in-flow picker', () => {
    setBody(`
      <footer>
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </footer>
    `);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  it('returns null for a fixed full-width cookie strip (fails the height test)', () => {
    setBody(`
      <div id="strip" style="position:fixed;left:0;right:0;bottom:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const strip = document.querySelector('#strip');
    if (strip) stubRect(strip, VIEWPORT.width, 90);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  it('returns null for a fixed sidebar drawer (fails the width test)', () => {
    setBody(`
      <div id="drawer" style="position:fixed;top:0;bottom:0;left:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const drawer = document.querySelector('#drawer');
    if (drawer) stubRect(drawer, 320, VIEWPORT.height);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  it('accepts an overlay exactly at the coverage threshold and rejects just under', () => {
    setBody(`
      <div id="backdrop" style="position:fixed;inset:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const backdrop = document.querySelector('#backdrop');
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker || !backdrop) return;

    stubRect(backdrop, VIEWPORT.width * MIN_GATE_COVERAGE, VIEWPORT.height * MIN_GATE_COVERAGE);
    expect(findGateOverlay(picker, VIEWPORT)?.id).toBe('backdrop');

    stubRect(backdrop, VIEWPORT.width * MIN_GATE_COVERAGE, VIEWPORT.height * MIN_GATE_COVERAGE - 1);
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  // Placement, not just size. A full-viewport-SIZED box parked outside the
  // viewport blocks nothing — and an off-canvas nav drawer, which is exactly
  // that shape, routinely carries the site's language switcher.
  it.each([
    ['parked off to the left (translateX(-100%))', -VIEWPORT.width, 0],
    ['parked above the fold (translateY(-100%))', 0, -VIEWPORT.height],
    ['parked just far enough left to fall under the coverage threshold', -251, 0],
  ])('ignores a fixed full-size overlay %s', (_label, left, top) => {
    setBody(`
      <div id="drawer" style="position:fixed;top:0;left:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const drawer = document.querySelector('#drawer');
    if (drawer) stubRect(drawer, VIEWPORT.width, VIEWPORT.height, left, top);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  it('still accepts an overlay that overhangs the viewport on both edges', () => {
    // A backdrop wider/taller than the viewport (e.g. `width:120vw`, or one
    // shifted by a scrollbar) covers it completely — clamping to the viewport
    // is what keeps the overhang from being counted or penalised.
    setBody(`
      <div id="backdrop" style="position:fixed;inset:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const backdrop = document.querySelector('#backdrop');
    if (backdrop) stubRect(backdrop, VIEWPORT.width + 200, VIEWPORT.height + 200, -100, -100);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)?.id).toBe('backdrop');
  });

  it('ignores an absolutely-positioned full-viewport box (only `fixed` blocks)', () => {
    setBody(`
      <div id="shell" style="position:absolute;inset:0;">
        <a href="/ua/x" hreflang="uk">Українська</a>
        <a href="/x" hreflang="ru">Русский</a>
      </div>
    `);
    const shell = document.querySelector('#shell');
    if (shell) stubRect(shell, VIEWPORT.width, VIEWPORT.height);
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
  });

  // A hidden subtree still classifies — findLanguagePickers is a pure markup
  // read — so the picker exists in every case below and it is the gate check
  // that has to reject it.
  it.each(['display:none', 'visibility:hidden', 'opacity:0'])(
    'ignores an overlay hidden by %s',
    (hidden) => {
      setBody(`
        <div id="backdrop" style="position:fixed;inset:0;${hidden};">
          <a href="/ua/x" hreflang="uk">Українська</a>
          <a href="/x" hreflang="ru">Русский</a>
        </div>
      `);
      const backdrop = document.querySelector('#backdrop');
      if (backdrop) stubRect(backdrop, VIEWPORT.width, VIEWPORT.height);
      const [picker] = findLanguagePickers();
      expect(picker).toBeDefined();
      if (!picker) return;
      expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
    },
  );

  describe('backdrop beneath the picker, outside its ancestor chain', () => {
    const realElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
    afterEach(() => {
      if (realElementsFromPoint)
        Object.defineProperty(document, 'elementsFromPoint', realElementsFromPoint);
      else Reflect.deleteProperty(document, 'elementsFromPoint');
    });

    it('finds a covering backdrop painted beneath the picker', () => {
      setupSiblingBackdropGate();
      stubHitStack('buttons', 'panel', 'dim', 'column');
      const [picker] = findLanguagePickers();
      expect(picker?.container.id).toBe('buttons');
      if (!picker) return;
      expect(findGateOverlay(picker, VIEWPORT)?.id).toBe('dim');
    });

    it('rejects it when something else paints over the picker', () => {
      // The picker is covered — by the backdrop or anything else — so it is
      // not the thing the page is asking the visitor to use.
      setupSiblingBackdropGate();
      stubHitStack('dim', 'buttons', 'panel', 'column');
      const [picker] = findLanguagePickers();
      if (!picker) throw new Error('picker not classified');
      expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
    });

    it('rejects a fixed header painted above an UNRELATED body-level backdrop', () => {
      // A newsletter/cookie modal's backdrop that happens to sit under a
      // high-z sticky header: the header's switcher is on top of a covering
      // box, but the two share nothing below <body>, so it is not a gate.
      setBody(`
        <header id="header" style="position:fixed;top:0;left:0;right:0;z-index:100;">
          <div id="langs">
            <a href="/ua/x" hreflang="uk">Українська</a>
            <a href="/x" hreflang="ru">Русский</a>
          </div>
        </header>
        <div id="dim" style="position:fixed;inset:0;z-index:50;"></div>
      `);
      const header = document.querySelector('#header');
      const dim = document.querySelector('#dim');
      const langs = document.querySelector('#langs');
      if (header) stubRect(header, VIEWPORT.width, 80);
      if (dim) stubRect(dim, VIEWPORT.width, VIEWPORT.height);
      if (langs) stubRect(langs, 200, 40, 780, 20);
      stubHitStack('langs', 'header', 'dim');
      const [picker] = findLanguagePickers();
      if (!picker) throw new Error('picker not classified');
      expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
    });

    it('rejects a backdrop that does not cover the viewport', () => {
      setupSiblingBackdropGate();
      const dim = document.querySelector('#dim');
      if (dim) stubRect(dim, VIEWPORT.width, VIEWPORT.height * MIN_GATE_COVERAGE - 1);
      stubHitStack('buttons', 'panel', 'dim', 'column');
      const [picker] = findLanguagePickers();
      if (!picker) throw new Error('picker not classified');
      expect(findGateOverlay(picker, VIEWPORT)).toBeNull();
    });
  });

  it('returns null when the viewport has no area (degenerate/detached document)', () => {
    setupGate();
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, { width: 0, height: 0 })).toBeNull();
  });
});
