/**
 * Visual-regression coverage for the popup DiagnosticsPanel (Phase 4 of the
 * per-snippet detection design — see docs/per-snippet-language-detection.md).
 *
 * Why this needs its own spec rather than a case in `popup.visual.spec.ts`:
 * the panel's render path requires a `movar:getDiagnostics` response from the
 * content script on the active tab, and a `chrome-extension://` popup page has
 * no content script — which is exactly why `popup.visual.spec.ts` documents the
 * panel (like HiddenPanel) as out of its scope. Here we close that gap by
 * stubbing the message bridge at the context level: an init script reassigns
 * `chrome.tabs.query` / `chrome.tabs.sendMessage` before the popup bundle runs,
 * so `sendToActiveTab` resolves with a deterministic, seeded divergence set.
 * webextension-polyfill reads `chrome.tabs[method]` at call time, so the
 * reassignment is picked up by `browser.tabs.*` inside the popup.
 *
 * The seed is fixed (no timestamps that tick, no randomness) so the baseline is
 * stable run-to-run. Diagnostics is off by default, so `setMovarSettings` flips
 * it on — that flip is also what proves `getSettings()` ran (the panel only
 * renders when `settings.diagnostics` is true).
 */
import type { DiagnosticsSummary } from '@movar/shared';
import { expect, test } from '../fixtures/extension';
import { openPopup, popupRoot } from '../fixtures/popup';

/**
 * Deterministic divergence set. Each entry is a plausible distinctive-free
 * Russian snippet the fast classifier mis-called as Ukrainian while the franc
 * oracle (the cross-check) said Russian — the contradiction the panel surfaces.
 * `total` exceeds `recent.length` to exercise the "N divergences" header count
 * against a bounded recent list.
 */
const SEED: DiagnosticsSummary = {
  total: 7,
  recent: [
    {
      id: 'd1',
      timestamp: 1_717_000_000_000,
      domain: 'news.example',
      candidates: ['uk', 'ru'],
      classifier: { language: 'uk', margin: 1, rung: '2a' },
      oracle: { language: 'ru', margin: 0.38 },
      sample: 'Последние новости часа: что произошло в мире сегодня',
      lengthBucket: 'm',
    },
    {
      id: 'd2',
      timestamp: 1_717_000_000_001,
      domain: 'shop.example',
      candidates: ['uk', 'ru'],
      classifier: { language: 'uk', margin: 2, rung: 1 },
      oracle: { language: 'ru', margin: 0.51 },
      sample: 'Главная страница магазина',
      lengthBucket: 's',
    },
    {
      id: 'd3',
      timestamp: 1_717_000_000_002,
      domain: 'video.example',
      candidates: ['uk', 'ru'],
      classifier: { language: 'uk', margin: 1, rung: '2b' },
      oracle: { language: 'ru', margin: 0.29 },
      sample: 'Смотрите полное видео на нашем канале прямо сейчас',
      lengthBucket: 'm',
    },
  ],
};

/**
 * Runs in the popup page BEFORE its bundle. Reassigns the two `chrome.tabs`
 * methods `sendToActiveTab` relies on so the bridge resolves with `seed`.
 * Self-contained (Playwright serialises it across the boundary) — no imports,
 * no outer refs except the `seed` argument.
 */
function installBridgeStub(seed: DiagnosticsSummary): void {
  const tabs = (globalThis as unknown as { chrome?: { tabs?: Record<string, unknown> } }).chrome
    ?.tabs;
  if (!tabs) return;

  const set = (name: string, fn: (...args: unknown[]) => unknown): void => {
    try {
      tabs[name] = fn;
    } catch {
      Object.defineProperty(tabs, name, { value: fn, configurable: true, writable: true });
    }
  };

  // Pretend there's one active tab so `activeTabId()` resolves to an id.
  set('query', (...args: unknown[]) => {
    const cb = args.find((a) => typeof a === 'function') as ((t: unknown) => void) | undefined;
    const result = [{ id: 1, active: true, windowId: 1 }];
    if (cb) {
      cb(result);
      return;
    }
    return Promise.resolve(result);
  });

  // Answer the popup's diagnostics request; anything else resolves to null so
  // the HiddenPanel stays absent and the snapshot is focused on diagnostics.
  set('sendMessage', (...args: unknown[]) => {
    const message = args[1] as { type?: string } | undefined;
    const cb = args.find((a) => typeof a === 'function') as ((r: unknown) => void) | undefined;
    const resp = message?.type === 'movar:getDiagnostics' ? seed : null;
    if (cb) {
      cb(resp);
      return;
    }
    return Promise.resolve(resp);
  });
}

/**
 * One row per (locale × scheme) axis, mirroring `popup.visual.spec.ts`: uk
 * covers the translated header + Cyrillic count plural; dark covers the
 * token flip (panel border, row `bg-surface-2`, copy-icon contrast). `title`
 * and `count` are the locale's literal header strings, used both as the settle
 * signal and as proof the right catalogue loaded.
 */
const CASES = [
  {
    name: 'English UI',
    priority: ['en', 'uk'],
    colorScheme: 'light',
    snapshot: 'popup-diagnostics-en.png',
    title: 'Detection diagnostics',
    count: '7 divergences',
  },
  {
    name: 'Ukrainian UI',
    priority: ['uk', 'en'],
    colorScheme: 'light',
    snapshot: 'popup-diagnostics-uk.png',
    title: 'Діагностика розпізнавання',
    count: '7 розбіжностей',
  },
  {
    name: 'English UI, dark',
    priority: ['en', 'uk'],
    colorScheme: 'dark',
    snapshot: 'popup-diagnostics-en-dark.png',
    title: 'Detection diagnostics',
    count: '7 divergences',
  },
] as const;

test.describe('extension popup — diagnostics panel (visual)', () => {
  for (const c of CASES) {
    test(`renders recent divergences, ${c.name}`, async ({
      movarContext,
      extensionId,
      setMovarSettings,
    }) => {
      await setMovarSettings({ priority: [...c.priority], diagnostics: true });
      await movarContext.addInitScript(installBridgeStub, SEED);
      const page = await openPopup(
        movarContext,
        extensionId,
        c.colorScheme === 'dark' ? { colorScheme: 'dark' } : {},
      );

      // Settle on the seeded panel: locale title, the header count (total=7,
      // not the 3 shown), and a sample domain. All three appearing proves the
      // bridge stub fired and `settings.diagnostics` gated the panel on.
      await expect(page.getByText(c.title)).toBeVisible();
      await expect(page.getByText(c.count)).toBeVisible();
      await expect(page.getByText('news.example')).toBeVisible();

      await expect(popupRoot(page)).toHaveScreenshot(c.snapshot);
      await page.close();
    });
  }
});
