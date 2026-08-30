/**
 * WCAG AA text-contrast guard for the marketing site.
 *
 * Runs the full matrix the visual suite runs — every page in `./pages`, in both
 * locales, under both `prefers-color-scheme` values — and measures the real
 * contrast of every rendered text node against the background actually painted
 * behind it. A violation fails the build.
 *
 * WHY THIS EXISTS. The site was shipping 136 failing text elements in dark mode
 * across 11 pages, and none of the existing checks could see it. The visual
 * suite shoots the same pages in both schemes, but a screenshot diff only
 * notices *change* — it happily locks in unreadable text as the baseline, which
 * is precisely what it had done. Contrast is a property you have to compute,
 * not one you can eyeball in a PNG.
 *
 * Two failure shapes were behind almost all of it, and both are the kind that
 * only a computed check catches:
 *
 *  1. **A fill token used as text.** `--accent` is paired with `--accent-on` for
 *     `bg-accent` buttons, so it is deliberately theme-stable. Used as *text* it
 *     scored 3.0–3.9:1 on every dark surface. Hence `--accent-text`, which flips.
 *  2. **Components that opt out of the token system.** `HowItWorks.astro` hand-
 *     rolled a permanently dark band from raw `stone-*` utilities, so its greys
 *     never went through the ink scale and landed at 2.59:1.
 *
 * HOW THE MEASUREMENT WORKS, and the one trap in it. Colours are resolved by
 * painting them onto a 1×1 canvas twice — once over white, once over black —
 * and solving for alpha. That indirection is not incidental: Tailwind 4 emits
 * `oklch()` for its default palette, and a regex that only understands
 * `rgb()`/`rgba()` silently skips those backgrounds and walks on up to `<body>`.
 * A naive parser therefore reports the dark band as *white*, which inverts every
 * result on it — it scored the band's greys as passing and its light text as
 * failing. If you touch `resolveColor`, keep it going through the canvas.
 *
 * Backgrounds are composited up the ancestor chain until the accumulated alpha
 * is opaque, so translucent panels are measured as they actually render.
 *
 * WHAT IT DOES NOT COVER. Text over a `background-image` or gradient is skipped
 * — there is no single background colour to measure, and guessing produces
 * false failures. Non-text contrast (WCAG 1.4.11: control boundaries, focus
 * rings, meaningful graphics) is not checked here either; that needs a judgment
 * about which elements are controls, which a sweep cannot make on its own.
 */
import { expect, test } from '@playwright/test';

import { PAGES } from './pages';

/**
 * Violations that are known, reviewed and deliberately still shipping.
 *
 * Empty, and it should stay that way. This exists so that a genuinely
 * unfixable case can be recorded with a reason and a date instead of the guard
 * being switched off — an allowlist entry is a decision someone made, a skipped
 * suite is a decision nobody made. Match on `${fg} on ${bg}`.
 */
const ALLOWED: readonly { pair: string; why: string }[] = [];

const LOCALES = [
  { key: 'en', tag: 'en-US', isUk: false },
  { key: 'uk', tag: 'uk-UA', isUk: true },
] as const;

const SCHEMES = ['light', 'dark'] as const;

interface Violation {
  ratio: number;
  required: number;
  fg: string;
  bg: string;
  fontPx: number;
  weight: number;
  text: string;
  selector: string;
}

/**
 * Walks the rendered document and returns every text element whose contrast is
 * below its WCAG AA floor. Runs in the page, so it must stay self-contained.
 */
/* eslint-disable unicorn/consistent-function-scoping --
   Everything in here is serialized into the page by `page.evaluate`, so every
   helper has to be declared inside this one function. Hoisting them to module
   scope, as the rule wants, would put them out of the browser's reach. */
function auditContrast(): Violation[] {
  const overWhite = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const overBlack = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!overWhite || !overBlack) return [];

  interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
  }
  const cache = new Map<string, Rgba | null>();

  /* Resolve ANY CSS colour — including oklch(), color() and named colours —
   * by painting it over white and over black and solving for alpha. See the
   * file header: a string parser silently drops oklch and inverts the results. */
  const resolveColor = (input: string): Rgba | null => {
    const hit = cache.get(input);
    if (hit !== undefined) return hit;
    let out: Rgba | null = null;
    try {
      for (const [ctx, backdrop] of [
        [overWhite, '#ffffff'],
        [overBlack, '#000000'],
      ] as const) {
        ctx.canvas.width = 1;
        ctx.canvas.height = 1;
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = input;
        ctx.fillRect(0, 0, 1, 1);
      }
      const w = overWhite.getImageData(0, 0, 1, 1).data;
      const b = overBlack.getImageData(0, 0, 1, 1).data;
      const [wr, br, bg_, bb] = [w[0] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0];
      const alpha = 1 - (wr - br) / 255;
      out =
        alpha <= 0.002
          ? { r: 0, g: 0, b: 0, a: 0 }
          : { r: br / alpha, g: bg_ / alpha, b: bb / alpha, a: Math.min(1, alpha) };
    } catch {
      out = null;
    }
    cache.set(input, out);
    return out;
  };

  const composite = (fg: Rgba, bg: Rgba): Rgba => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const luminance = (c: Rgba): number => {
    const channel = (raw: number): number => {
      const v = Math.min(255, Math.max(0, raw)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };

  const contrast = (a: Rgba, b: Rgba): number => {
    const [hi, lo] =
      luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
    return (hi + 0.05) / (lo + 0.05);
  };

  const hex = (c: Rgba): string =>
    '#' +
    [c.r, c.g, c.b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');

  /** Composite ancestor backgrounds until opaque. `null` means the element sits
   *  on an image or gradient, where there is no single colour to measure. */
  const backdropOf = (el: Element): Rgba | null => {
    let node: Element | null = el;
    let acc: Rgba | null = null;
    while (node) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const layer = resolveColor(style.backgroundColor);
      if (layer && layer.a > 0.004) {
        acc = acc ? composite(acc, layer) : layer;
        if (acc.a >= 0.995) return acc;
      }
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let i = 0; node && i < 3; i++, node = node.parentElement) {
      const cls =
        typeof node.className === 'string' && node.className
          ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
      parts.unshift(node.tagName.toLowerCase() + cls);
    }
    return parts.join(' > ');
  };

  const out: Violation[] = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity) === 0
    )
      continue;
    // Only elements holding their own text — otherwise every wrapper is counted
    // again for the text of its children.
    const ownsText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
    );
    if (!ownsText) continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;

    const fg = resolveColor(style.color);
    if (!fg || fg.a < 0.05) continue;
    const bg = backdropOf(el);
    if (!bg) continue;

    const ratio = contrast(composite(fg, bg), bg);
    const fontPx = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const required = fontPx >= 24 || (fontPx >= 18.66 && weight >= 700) ? 3 : 4.5;
    if (ratio + 0.005 < required) {
      out.push({
        ratio: Math.round(ratio * 100) / 100,
        required,
        fg: hex(fg),
        bg: hex(bg),
        fontPx: Math.round(fontPx * 10) / 10,
        weight,
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48),
        selector: describe(el),
      });
    }
  }
  return out.toSorted((a, b) => a.ratio - b.ratio);
}
/* eslint-enable unicorn/consistent-function-scoping -- end of the browser-serialized function */

for (const scheme of SCHEMES) {
  for (const locale of LOCALES) {
    test.describe(`contrast — ${locale.key} (${scheme})`, () => {
      test.use({ locale: locale.tag, colorScheme: scheme });

      for (const marketingPage of PAGES) {
        const url = locale.isUk ? marketingPage.uk : marketingPage.en;
        if (!url) continue; // uk-only page (blog, guide) — no English twin to check

        test(`${marketingPage.stem} has no AA text-contrast failures`, async ({ page }) => {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          // Webfonts change metrics, and metrics decide the large-text floor.
          await page.evaluate(async () => {
            await document.fonts.ready;
          });

          const found = await page.evaluate(auditContrast);
          const violations = found.filter(
            (v) => !ALLOWED.some((a) => a.pair === `${v.fg} on ${v.bg}`),
          );

          expect(
            violations,
            violations.length === 0
              ? ''
              : `${violations.length} contrast failure(s) on ${url} (${scheme}):\n` +
                  violations
                    .map(
                      (v) =>
                        `  ${String(v.ratio).padStart(5)}:1 (needs ${v.required}) ` +
                        `${v.fg} on ${v.bg}  ${v.fontPx}px/${v.weight}  ` +
                        `"${v.text}"\n      ${v.selector}`,
                    )
                    .join('\n'),
          ).toEqual([]);
        });
      }
    });
  }
}
