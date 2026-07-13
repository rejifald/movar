import { chromium } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';

/**
 * A plain Chromium persistent context (NO extension) for the `file://`-loaded
 * visual suites — the Safari host-app bundle (`host.ts`) and the diagnostics
 * harness (`diagnostics.ts`). Two shared guarantees:
 *   - `--allow-file-access-from-files` so a bundle's sibling `./x.js` / `./x.css`
 *     resolve over `file://` (Chromium otherwise blocks the cross-`file://` fetch
 *     and the page renders blank);
 *   - `deviceScaleFactor: 1` so CSS pixels are constant across 1x / 2x hosts —
 *     the same pixel-stability guarantee the extension fixture gives the
 *     popup/options baselines.
 *
 * When headless, forces the full `chromium` channel (not the stripped
 * `chromium-headless-shell`, which can't load extensions and renders subtly
 * differently) so rendering — and thus the committed baselines — matches the
 * repo's other visual specs.
 */
export async function launchFileAccessContext(headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    ...(headless ? { headless: true, channel: 'chromium' as const } : { headless: false }),
    args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-dev-shm-usage'],
    deviceScaleFactor: 1,
  });
}
