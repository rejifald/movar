/**
 * Visible-text sampler for tier-7 body-language detection.
 *
 * Landmark-aware: picks `<main>` / `<article>` / `[role="main"]` when present,
 * falls back to `<body>`. `innerText` skips `display: none` /
 * `visibility: hidden` (browser-native), so it's automatically cleaner than
 * `textContent`. Capped at 2000 chars — beyond that the trigram engines'
 * accuracy plateaus while parse cost rises.
 *
 * Cost: one `querySelector` + one synchronous layout / reflow per call. See
 * docs/on-device-language-detection.md (Bundle & cost) for the budget.
 */

const SAMPLE_CAP_CHARS = 2000;

/** Explicit precedence — `<main>` beats `<article>` beats `[role="main"]`
 *  beats `<body>`. A single grouped selector would return the first matching
 *  element in DOM order, not the first matching selector; an article
 *  rendered above main would wrongly win. */
export function sampleVisibleText(doc: Document = document): string {
  const root =
    doc.querySelector('main') ??
    doc.querySelector('article') ??
    doc.querySelector('[role="main"]') ??
    doc.body;
  if (!(root instanceof HTMLElement)) return '';
  // innerText is the deliberate choice over textContent: it skips
  // `display:none` / `visibility:hidden` subtrees and `<script>`/`<style>`
  // contents natively, giving cleaner trigram input without a hand-rolled
  // hidden-element walker. Cross-tier per-card extraction uses textContent
  // instead because card serialisation already maintains its own
  // hidden-skip list — different problem, different tool.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  return (root.innerText ?? '').trim().slice(0, SAMPLE_CAP_CHARS);
}
