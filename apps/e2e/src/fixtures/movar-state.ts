/**
 * Inspect what Movar has done to the current page from the DOM side:
 *
 *   - which elements carry `data-movar-hidden` (the picker-filter result)
 *   - which curtain hosts are mounted (`data-movar-curtain` — content-filter
 *     blur cards + picker-container chip overlays)
 *   - whether the `[data-movar-restored]` marker was set (the user-pressed
 *     "Show hidden options" path)
 *
 * Used by the parameterised spec to make per-site assertions without each
 * fixture having to know Movar's attribute vocabulary.
 */
import type { Page } from '@playwright/test';

export interface MovarDomState {
  hiddenLinkCount: number;
  curtainCount: number;
  pickerContainerCurtainCount: number;
  contentBlurCount: number;
  trimmedTextCount: number;
}

export async function readMovarDomState(page: Page): Promise<MovarDomState> {
  return page.evaluate(() => {
    const hiddenLinks = document.querySelectorAll('[data-movar-hidden]').length;
    const curtainHosts = document.querySelectorAll('[data-movar-curtain]');
    let containerKind = 0;
    let blurKind = 0;
    for (const h of curtainHosts) {
      const kind = (h as HTMLElement).dataset['movarKind'];
      if (kind === 'picker-container') containerKind += 1;
      else blurKind += 1;
    }
    const trimmed = document.querySelectorAll('[data-movar-original-text]').length;
    return {
      hiddenLinkCount: hiddenLinks,
      curtainCount: curtainHosts.length,
      pickerContainerCurtainCount: containerKind,
      contentBlurCount: blurKind,
      trimmedTextCount: trimmed,
    };
  });
}

/** Wait until Movar has stopped modifying the page (no new
 *  `data-movar-hidden` for N consecutive polls), or `timeoutMs` elapses. */
export async function waitForMovarSettled(
  page: Page,
  options: { quietForMs?: number; timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const quietForMs = options.quietForMs ?? 800;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 150;
  const start = Date.now();
  let lastChange = Date.now();
  let lastCount = -1;
  while (Date.now() - start < timeoutMs) {
    const count = await page
      .evaluate(() => document.querySelectorAll('[data-movar-hidden],[data-movar-curtain]').length)
      .catch(() => -2);
    if (count !== lastCount) {
      lastCount = count;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= quietForMs) {
      return;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`waitForMovarSettled: timed out after ${timeoutMs}ms`);
}
