/**
 * Diagnostics-panel test fixture — loads the diagnostics e2e visual harness
 * (`apps/diagnostics/dist/harness/index.html`) from `file://` and prepares the
 * page for a deterministic snapshot of the FAB + floating panel.
 *
 * Why a harness (not the real extension): the diagnostics UI is a content-script
 * shadow-root widget whose snapshot is built by running the product models over
 * the live DOM — its rendered content drifts with whatever page it's on, so it
 * can't anchor a pixel baseline. The harness (`apps/diagnostics/e2e-harness/`)
 * instead renders the REAL `Widget` component against a hand-pinned
 * `PageDiagnostics` fixture that populates all four tabs, built standalone by
 * `vite.harness.config.ts` into `dist/harness/` (the `diagnostics:build:harness`
 * Nx target, a `dependsOn` of the e2e `test` / `test:update` targets, emits it).
 *
 * The context mirrors the Safari host-app fixture: a plain Chromium (NO
 * extension) with `--allow-file-access-from-files` so the bundle's sibling
 * assets resolve under `file://`, and `deviceScaleFactor: 1` for pixel-stable
 * CSS px across 1x / 2x hosts.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, test as base } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The built harness index the spec loads over `file://`. */
export const DIAGNOSTICS_HARNESS_INDEX = path.resolve(
  __dirname,
  '../../../diagnostics/dist/harness/index.html',
);

/** Generous enough for the 380×480 panel anchored bottom-right (`right-4
 *  bottom-[76px]`) plus its FAB to sit fully in view without scrolling. */
const DIAGNOSTICS_VIEWPORT = { width: 640, height: 760 } as const;

export interface OpenDiagnosticsOptions {
  /** `prefers-color-scheme` — the shared `@movar/theme` tokens flip the panel on
   *  this media query (no class toggle), same as every other surface. */
  colorScheme?: 'light' | 'dark';
}

/** `file://` URL for the built harness, each segment encoded so a space/unicode
 *  char in the repo path (the `.claude/worktrees/…` tree can hold either) stays
 *  valid — same helper the host-app fixture uses. */
function harnessUrl(): string {
  return `file://${DIAGNOSTICS_HARNESS_INDEX.split(path.sep).map(encodeURIComponent).join('/')}`;
}

/** The floating action button — always mounted; toggles the panel. Its
 *  accessible name is `Movar Diagnostics — <n> would block`. */
export function diagnosticsFab(page: Page): Locator {
  return page.getByRole('button', { name: /^Movar Diagnostics/ });
}

/** The expanded panel — a `<section aria-label="Movar Diagnostics">`, i.e. a
 *  named `region`. Only present once the FAB is toggled open. */
export function diagnosticsPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Movar Diagnostics' });
}

/**
 * Load the harness bundle and settle it for assertion / snapshot: pin the color
 * scheme, wait for the FAB to mount (proves the bundle loaded + React committed),
 * kill transitions (the FAB hover-scale + the tab colour fade), and await
 * `document.fonts.ready` so glyph metrics are stable across runners.
 */
export async function openDiagnostics(
  context: BrowserContext,
  options: OpenDiagnosticsOptions = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ ...DIAGNOSTICS_VIEWPORT });
  await page.emulateMedia(
    options.colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce', colorScheme: 'light' },
  );

  await page.goto(harnessUrl());
  await diagnosticsFab(page).waitFor({ state: 'visible' });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => document.fonts.ready);

  return page;
}

/** Per-launch context: plain Chromium (NO extension), file-access flag, 1x DPR —
 *  identical rationale to the Safari host-app fixture's `hostContext`. */
export const test = base.extend<{ diagnosticsContext: BrowserContext }>({
  diagnosticsContext: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...(headless ? { headless: true, channel: 'chromium' as const } : { headless: false }),
      args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-dev-shm-usage'],
      deviceScaleFactor: 1,
    });
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
