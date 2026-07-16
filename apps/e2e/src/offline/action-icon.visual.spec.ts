/**
 * Toolbar / action-icon state visual baselines.
 *
 * The browser toolbar button (the one that opens the popover) is a
 * self-contained raster asset handed to `browser.action.setIcon` — one PNG that
 * must read on both light and dark browser chrome, with NO CSS context. Its
 * geometry lives as a single SVG-string source of truth in
 * `@movar/ui/action-icon-svg` (`actionIconSvg`), shared with the React
 * `ActionIcon` Storybook wrapper and the future Sharp raster pipeline.
 *
 * This spec pins that source: it lays every state out on both chromes, from a
 * big preview down to true 16px, and compares one baseline over the sheet. A
 * regression in any state's indicator (a dot colour drifting off the forest /
 * stone / danger palette, a slash/pause/check glyph moving, the dimming
 * changing) lands as a pixel diff. Importing the same `actionIconSvg` the app
 * ships means the baseline can't drift from the component.
 *
 * Offline + deterministic like the sibling `*.visual.spec.ts` files: no network,
 * no extension — the page is built with `setContent`. Manrope (the brand "r")
 * is inlined as a base64 `@font-face` so the glyph is the shipped one and
 * renders identically in the pinned Playwright container rather than falling
 * back to the container's default sans-serif.
 *
 * Baselines are Linux PNGs generated in that container via
 * `pnpm e2e:baselines -- --grep action-icon` (see scripts/e2e-baselines.sh) —
 * the same image CI's `e2e-offline` job compares against. Don't run
 * `test:update` on your host: it writes a `*-darwin.png` CI never uses.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test } from '@playwright/test';
import { ACTION_ICON_STATES, actionIconSvg } from '@movar/ui/action-icon-svg';

// Representative browser-chrome fills — Chrome's light and dark toolbar greys.
// Fixed, not theme tokens: the icon has to survive both, whatever the OS theme.
const LIGHT_CHROME = '#e8eaed';
const DARK_CHROME = '#202124';

// The three sizes worth pinning: a legibility preview, a 2×-toolbar size (where
// the sub-glyphs resolve), and true 1× toolbar size (the honest legibility floor).
const SIZES = [96, 32, 16] as const;

/** Manrope 800 (the brand "r") inlined as a data URI so the sheet renders the
 *  shipped glyph deterministically, with no font-install dependency. Resolved
 *  from this package's own `@fontsource/manrope` devDep. */
function manropeFontFace(): string {
  const require = createRequire(import.meta.url);
  const file = require.resolve('@fontsource/manrope/files/manrope-latin-800-normal.woff2');
  const base64 = readFileSync(file).toString('base64');
  return `@font-face{font-family:'Manrope';font-weight:800;font-style:normal;font-display:block;src:url(data:font/woff2;base64,${base64}) format('woff2');}`;
}

function galleryHtml(): string {
  const rows = ACTION_ICON_STATES.map(({ key, label, summary }) => {
    const cells = SIZES.flatMap((size) =>
      [LIGHT_CHROME, DARK_CHROME].map(
        (chrome) =>
          `<div class="cell" style="background:${chrome}"><span class="ico">${actionIconSvg(key, {
            size,
          })}</span><span class="cap" style="color:${
            chrome === DARK_CHROME ? '#9aa0a6' : '#5f6368'
          }">${size}</span></div>`,
      ),
    ).join('');
    return `<div class="row"><div class="meta"><b>${label}</b> <code>${key}</code><p>${summary}</p></div><div class="cells">${cells}</div></div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${manropeFontFace()}
    *{box-sizing:border-box;margin:0}
    body{font-family:-apple-system,system-ui,sans-serif;background:#fff;padding:24px}
    #sheet{display:flex;flex-direction:column;gap:20px;width:860px}
    .row{display:flex;gap:20px;align-items:center;border-bottom:1px solid #e7e5e4;padding-bottom:20px}
    .meta{width:280px;flex-shrink:0}
    .meta b{font-size:15px;color:#1c1917}
    .meta code{font-size:12px;color:#a8a29e;margin-left:6px}
    .meta p{font-size:13px;color:#78716c;margin-top:4px}
    .cells{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .cell{display:inline-flex;flex-direction:column;align-items:center;gap:6px;padding:14px;border-radius:12px}
    .ico{display:inline-flex;line-height:0}
    .cap{font-size:11px}
  </style></head><body><div id="sheet">${rows}</div></body></html>`;
}

test('action icon — every state on light and dark chrome', async ({ page }) => {
  await page.setViewportSize({ width: 908, height: 1200 });
  await page.setContent(galleryHtml(), { waitUntil: 'load' });

  // Settle fonts before snapshotting: the brand "r" is Manrope, and a snapshot
  // taken mid-load captures the fallback glyph. Force the exact face, then wait
  // for all pending loads to finish.
  await page.evaluate(async () => {
    await document.fonts.load("800 96px 'Manrope'");
    await document.fonts.ready;
  });

  await expect(page.locator('#sheet')).toHaveScreenshot('action-icon-gallery.png');
});
