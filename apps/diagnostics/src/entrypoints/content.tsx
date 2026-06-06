/**
 * Diagnostics content script (decision 4: in-page FAB + floating panel). It
 * reuses the **product's own models** as library code (decision 2 holds — no
 * runtime coupling, nothing read from the running product): the page-content
 * extractor and the language-picker model. On each sweep it rebuilds a snapshot
 * (`refresh`) of what those models extract + how `@movar/lang-detect` classifies
 * it, and the panel renders it.
 *
 * The UI mounts into an isolated shadow root in this same world, so the panel
 * reads the snapshot and triggers highlights with direct calls. Works in every
 * browser, Safari included.
 */
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { getProfiles } from '@movar/lang-detect';
import { defaultSettings } from '@movar/settings';
import { refresh } from '../lib/page-diagnostics';
import { App } from '../ui/App';
// cssInjectionMode: 'ui' routes this into the shadow root instead of the page.
import '../styles/globals.css';

// Mirror the product's default config: classify across priority ∪ blocked, and
// flag anything in `blocked` as "would be concealed".
const candidates = getProfiles([...defaultSettings.priority, ...defaultSettings.blocked]);
const blocked = new Set(defaultSettings.blocked);

/** Debounce for re-sweeping after DOM mutations (SPA navigations, feeds). */
const MUTATION_DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const host = location.hostname;
    const sweep = (): void => {
      refresh({ candidates, blocked, host, href: location.href });
    };

    // Mount the FAB + floating panel inside a shadow root (style-isolated from
    // the host page; invisible to the product models' DOM queries).
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'movar-diagnostics',
      position: 'inline',
      anchor: 'body',
      isolateEvents: true,
      onMount: (container) => {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();

    // Snapshot now and on later mutations (SPA navigations, infinite feeds).
    sweep();
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (scheduled !== null) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        sweep();
      }, MUTATION_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => {
      observer.disconnect();
    });
  },
});
