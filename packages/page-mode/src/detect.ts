/**
 * Generic page-mode detector — the chained signal pipeline most pages go
 * through. Mirrors the shape of `page-language.ts`: each tier is a small
 * pure function, the orchestrator calls them in falling-confidence order
 * and returns the first non-null answer.
 *
 * Tiers, most to least reliable:
 *   1. Explicit theme attributes on <html>/<body> — the site's own switch
 *      wrote `data-theme`, `data-bs-theme`, `data-color-mode`, a `dark`
 *      class, or the bare `dark` attribute (YouTube). When the site has
 *      told us its mode, every other tier is noise.
 *   2. `<meta name="color-scheme">` or the computed `color-scheme` CSS
 *      property on the root element. Author intent for the browser's
 *      built-in form controls / scrollbars; reliable when set.
 *   3. Computed background of <body> (or <html> when body is transparent).
 *      Ground truth — whatever paints actually paints. Cheap to read,
 *      survives sites that don't follow any naming convention.
 *   4. `prefers-color-scheme` media query as the always-valid floor.
 *
 * Returns a non-null PageMode in every case because tier 4 always answers.
 */

import type { PageMode } from './types';

const DARK_THEME_VALUES = new Set(['dark']);
const LIGHT_THEME_VALUES = new Set(['light']);
const DARK_CLASS_TOKENS = new Set(['dark', 'theme-dark', 'is-dark', 'dark-mode']);
const LIGHT_CLASS_TOKENS = new Set(['light', 'theme-light', 'is-light', 'light-mode']);

const THEME_ATTRS = [
  'data-theme',
  'data-bs-theme', // Bootstrap 5.3
  'data-color-mode', // GitHub
  'data-mode',
  'data-color-scheme',
  'color-scheme',
] as const;

function modeFromAttrValue(value: string | null): PageMode | null {
  if (value == null || value === '') return null;
  const v = value.trim().toLowerCase();
  if (DARK_THEME_VALUES.has(v)) return 'dark';
  if (LIGHT_THEME_VALUES.has(v)) return 'light';
  return null;
}

// Token loop + two dictionary lookups per token; flat structure, not nested logic.
// fallow-ignore-next-line complexity
function modeFromClassList(el: Element): PageMode | null {
  const cls = typeof el.className === 'string' ? el.className : '';
  if (!cls) return null;
  for (const token of cls.split(/\s+/)) {
    const t = token.toLowerCase();
    if (DARK_CLASS_TOKENS.has(t)) return 'dark';
    if (LIGHT_CLASS_TOKENS.has(t)) return 'light';
  }
  return null;
}

function modeFromBareDarkAttr(el: Element): PageMode | null {
  // YouTube uses a bare `dark` attribute on <html>. The presence of the
  // attribute (regardless of value) is the signal. We don't have a
  // corresponding `light` bare attribute — sites that flip to light just
  // remove the attribute, so its absence is not a signal.
  return el.hasAttribute('dark') ? 'dark' : null;
}

/** Tier 1 — explicit theme attribute on <html> or <body>. */
// Sequential probes across roots × attrs + class + bare-dark; flattening would
// just shift the chain.
// fallow-ignore-next-line complexity
export function modeFromColorSchemeAttr(doc: Document): PageMode | null {
  // lib.dom types `body`/`documentElement` as non-null, but at `document_start`
  // (and in non-HTML or detached documents) `body` can be absent — skip whichever
  // root isn't there yet.
  const roots: readonly (HTMLElement | null)[] = [doc.documentElement, doc.body];
  for (const root of roots) {
    if (!root) continue;
    for (const attr of THEME_ATTRS) {
      const hit = modeFromAttrValue(root.getAttribute(attr));
      if (hit) return hit;
    }
    const cls = modeFromClassList(root);
    if (cls) return cls;
    const bare = modeFromBareDarkAttr(root);
    if (bare) return bare;
  }
  return null;
}

/** Tier 2 — `<meta name="color-scheme">` or computed CSS `color-scheme`. */
export function modeFromColorSchemeMeta(doc: Document, win: Window): PageMode | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="color-scheme" i]');
  const metaValue = meta?.getAttribute('content');
  const fromMeta = colorSchemeValueToMode(metaValue);
  if (fromMeta) return fromMeta;

  // getComputedStyle may be null in detached contexts; jsdom returns an empty
  // string for unset properties, which colorSchemeValueToMode handles.
  const css = win.getComputedStyle(doc.documentElement).colorScheme;
  return colorSchemeValueToMode(css);
}

/**
 * Parse a `color-scheme` value: "dark", "only dark", "light", "only light"
 * give a verdict; "light dark", "normal", or unset are ambiguous and return
 * null so the chain falls through.
 */
function colorSchemeValueToMode(value: string | null | undefined): PageMode | null {
  if (value == null || value === '') return null;
  const tokens = new Set(
    value
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t !== '' && t !== 'only'),
  );
  const hasDark = tokens.has('dark');
  const hasLight = tokens.has('light');
  // Both (or neither) → no single preference declared; fall through.
  if (hasDark === hasLight) return null;
  return hasDark ? 'dark' : 'light';
}

/** Tier 3 — luminance of the painted background of <body> (or <html>). */
// Per-root parse + alpha and luminance gates; each guard is documented and
// independent.
// fallow-ignore-next-line complexity
export function modeFromComputedBackground(doc: Document, win: Window): PageMode | null {
  const els: readonly (HTMLElement | null)[] = [doc.body, doc.documentElement];
  for (const el of els) {
    if (!el) continue;
    const bg = win.getComputedStyle(el).backgroundColor;
    const rgb = parseRgb(bg);
    if (!rgb) continue;
    // Fully transparent → the element isn't painting; defer to the next
    // element (or fall through to prefers-color-scheme).
    if (rgb.a === 0) continue;
    return luminance(rgb) > LIGHT_DARK_LUMINANCE_MIDPOINT ? 'light' : 'dark';
  }
  return null;
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Only the formats `getComputedStyle` returns: `rgb(r,g,b)` / `rgba(r,g,b,a)`.
// `transparent` computes to `rgba(0,0,0,0)`, so it needs no special case.
const RGB_PATTERN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/** Parse a computed `background-color` string into RGBA, or null if unrecognized. */
function parseRgb(value: string): RGBA | null {
  const m = RGB_PATTERN.exec(value);
  if (!m) return null;
  // r/g/b are `\d+` captures, so `Number(...)` is always finite; only the
  // optional alpha can be malformed (e.g. "1.2.3"), so it's the one we validate.
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (!Number.isFinite(a)) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}

// sRGB companding + WCAG 2.x relative-luminance weights. Fixed by the spec
// (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance); named so the transfer
// function below reads as math, not magic numbers.
const SRGB_CHANNEL_MAX = 255;
const SRGB_LINEAR_CUTOFF = 0.03928;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;
const LUMA_WEIGHT_R = 0.2126;
const LUMA_WEIGHT_G = 0.7152;
const LUMA_WEIGHT_B = 0.0722;
// Normalized-luminance midpoint: at-or-above is a light page, below is dark.
const LIGHT_DARK_LUMINANCE_MIDPOINT = 0.5;

/** Single sRGB channel → linear-light, as used by the WCAG luminance formula. */
function toLinearChannel(channel: number): number {
  const c = channel / SRGB_CHANNEL_MAX;
  return c <= SRGB_LINEAR_CUTOFF
    ? c / SRGB_LINEAR_DIVISOR
    : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA_EXPONENT;
}

/** WCAG 2.x relative luminance, normalized to [0, 1]. */
function luminance({ r, g, b }: RGBA): number {
  return (
    LUMA_WEIGHT_R * toLinearChannel(r) +
    LUMA_WEIGHT_G * toLinearChannel(g) +
    LUMA_WEIGHT_B * toLinearChannel(b)
  );
}

/** Tier 4 — OS / browser `prefers-color-scheme`. Always returns a value. */
export function modeFromPrefersColorScheme(win: Window): PageMode {
  if (typeof win.matchMedia !== 'function') return 'light';
  return win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Run the full chain and return the first non-null mode. Tier 4 always
 * answers, so the return is non-null.
 */
// eslint-disable-next-line unicorn/prefer-global-this -- defaulting to `window` keeps the param typed as Window; globalThis would need a cast.
export function detectPageMode(doc: Document = document, win: Window = window): PageMode {
  return (
    modeFromColorSchemeAttr(doc) ??
    modeFromColorSchemeMeta(doc, win) ??
    modeFromComputedBackground(doc, win) ??
    modeFromPrefersColorScheme(win)
  );
}
