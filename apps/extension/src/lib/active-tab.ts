import { browser } from 'wxt/browser';

/** The active tab's id, or `undefined` when there isn't one. Shared by every
 *  handler that needs to target "the tab the popup was opened over." */
export async function activeTabId(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

/** The active tab's URL, but only when it's an http(s) page worth acting on.
 *  chrome://, the Web Store, the new-tab page, and PDF/file viewers return
 *  null. */
export async function activeTabUrl(): Promise<string | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  return url != null && /^https?:/i.test(url) ? url : null;
}

/** Reload the active tab so the content script runs / re-runs with whatever
 *  setting just changed, then close the popup — the user reopens to see the
 *  refreshed state. Module-scoped: closes over no component state, so it's
 *  safe to call from a crashed component tree (the popup's crash fallback
 *  uses this directly rather than routing through the tree that just threw). */
export async function reloadActiveTab(): Promise<void> {
  const id = await activeTabId();
  if (id !== undefined) {
    try {
      await browser.tabs.reload(id);
    } catch {
      // chrome:// / store tabs can't always be reloaded by the extension; the
      // setting change still persisted, so Movar runs on the next web page.
    }
  }
  window.close();
}
