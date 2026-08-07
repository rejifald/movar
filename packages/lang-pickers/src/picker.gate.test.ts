import { describe, expect, it } from 'vitest';
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

  it('returns null when the viewport has no area (degenerate/detached document)', () => {
    setupGate();
    const [picker] = findLanguagePickers();
    expect(picker).toBeDefined();
    if (!picker) return;
    expect(findGateOverlay(picker, { width: 0, height: 0 })).toBeNull();
  });
});
