import { afterEach, beforeEach, vi } from 'vitest';
import { detachAllTooltips } from './tooltip';
import { detachAllCurtains } from './curtain';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('lang');
  // Site-CSS fidelity for jsdom. Custom elements default to display:inline, but
  // the site cards Movar conceals (YouTube's ytd-*/ytm-*, etc.) are block-level
  // on the real page — their own stylesheet says so. jsdom loads none of that
  // CSS, so without this every custom-element card would read as inline and trip
  // the curtain's inline→inline-block promotion (see promoteInlineTarget in
  // curtain.ts) — an artifact of the missing stylesheet, not real behaviour.
  // `:defined` excludes standard HTML, so genuine inline runs (span/a) stay
  // inline and the promotion still exercises exactly as it does in the browser.
  const uaFidelity = document.createElement('style');
  uaFidelity.textContent = ':not(:defined) { display: block; }';
  document.head.append(uaFidelity);
});

afterEach(() => {
  if (document.querySelector('[data-movar-tooltip]')) {
    detachAllTooltips();
  }
  if (document.querySelector('[data-movar-curtain]')) {
    detachAllCurtains();
  }
  vi.useRealTimers();
});
