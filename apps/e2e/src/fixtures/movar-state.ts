/**
 * Inspect what Movar has done to the current page from the DOM side:
 *
 *   - which elements carry `data-movar-hidden` (the picker-filter result)
 *   - which curtain hosts are mounted (`data-movar-curtain` — content-filter
 *     blur cards, picker-container chip overlays, and the in-row chips a
 *     list-shaped picker gets in place of survivor tooltips)
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
  /** Chips standing in a hidden row of a LIST-shaped picker (`picker-entry`).
   *  Counted apart from `contentBlurCount`, which would otherwise absorb them
   *  — it is the "everything that isn't a picker chip" bucket. */
  pickerEntryCurtainCount: number;
  /** Badges standing beside a control Movar cannot mark inside (`picker-badge`).
   *  Counted apart from `contentBlurCount` for the same reason as the chips. */
  pickerBadgeCount: number;
  contentBlurCount: number;
  trimmedTextCount: number;
}

export async function readMovarDomState(page: Page): Promise<MovarDomState> {
  return page.evaluate(() => {
    const hiddenLinks = document.querySelectorAll('[data-movar-hidden]').length;
    const curtainHosts = document.querySelectorAll('[data-movar-curtain]');
    // Every curtain host carries a `data-movar-kind` naming which surface it is;
    // anything unlabelled is a content-filter blur card.
    const byKind: Record<string, number> = {};
    for (const h of curtainHosts) {
      const kind = (h as HTMLElement).dataset['movarKind'] ?? 'content-blur';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    const trimmed = document.querySelectorAll('[data-movar-original-text]').length;
    return {
      hiddenLinkCount: hiddenLinks,
      curtainCount: curtainHosts.length,
      pickerContainerCurtainCount: byKind['picker-container'] ?? 0,
      pickerEntryCurtainCount: byKind['picker-entry'] ?? 0,
      pickerBadgeCount: byKind['picker-badge'] ?? 0,
      contentBlurCount: byKind['content-blur'] ?? 0,
      trimmedTextCount: trimmed,
    };
  });
}

/** Defaults for the {@link waitForMovarSettled} polling loop. */
const DEFAULT_QUIET_FOR_MS = 800;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 150;
/** Sentinel hidden-count when `page.evaluate` throws (navigation/teardown) —
 *  distinct from the -1 initial and any real >= 0 count, so a failed poll reads
 *  as a change rather than a quiet tick. */
const EVAL_FAILED_COUNT = -2;

/** Wait until Movar has stopped modifying the page (no new
 *  `data-movar-hidden` for N consecutive polls), or `timeoutMs` elapses. */
export async function waitForMovarSettled(
  page: Page,
  options: { quietForMs?: number; timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<void> {
  const quietForMs = options.quietForMs ?? DEFAULT_QUIET_FOR_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const start = Date.now();
  let lastChange = Date.now();
  let lastCount = -1;
  while (Date.now() - start < timeoutMs) {
    const count = await page
      .evaluate(() => document.querySelectorAll('[data-movar-hidden],[data-movar-curtain]').length)
      .catch(() => EVAL_FAILED_COUNT);
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
