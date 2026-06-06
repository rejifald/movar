/**
 * Popup-test helpers — opening, preparing for visual snapshots, and
 * stamping the storage values the popup reads on mount.
 *
 * The popup is rendered as a regular tab (`chrome-extension://<id>/popup.html`)
 * because Playwright can't drive the browser-action toolbar popup window
 * today. The underlying React tree is identical, so the contract this
 * suite proves — "the popup mounts and reads its real settings" — holds.
 *
 * Determinism notes for visual snapshots:
 *  - Viewport pinned to 420x720 (popup body is 360px; the 30px gutter
 *    means the snapshot's tight crop to `#root > div` never depends on
 *    page scroll position).
 *  - `prefers-reduced-motion: reduce` emulated AND a `*` rule injected
 *    that nukes animation/transition durations — belt and braces, since
 *    a few components key off the media query and others use bare
 *    `transition-colors`.
 *  - `document.fonts.ready` awaited so the first paint after navigate
 *    isn't a fallback-font frame. The popup loads @fontsource/manrope
 *    + @fontsource/ibm-plex-mono; both are subset to the popup's
 *    glyph set and resolve quickly, but "quickly" isn't "synchronously".
 *  - All non-default seeding (settings, pause, events) happens BEFORE
 *    navigation — the popup reads each on mount, never re-polls, so
 *    a mid-mount mutation race would silently turn an "off" snapshot
 *    into an "active" one. Seed-then-open is the only safe order.
 */
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import type { CorrectionEvent } from '@movar/events';
import type { LanguageCode } from '@movar/lang-detect';

/** Pinned visual viewport for popup snapshots. Width covers the popup's
 *  360px body plus a small gutter; height is comfortable for the longest
 *  state (active + content-toggle + 2 pause buttons + footer). Element-
 *  scoped screenshots crop to the popup root, so the gutter never lands
 *  in the baseline — but the page itself needs a stable canvas to lay
 *  out against. */
export const POPUP_VIEWPORT = { width: 420, height: 720 } as const;

/** Element-scoped snapshot target. The popup mounts exactly one root div
 *  under `#root` (the wrapper in `App.tsx`'s PopupBody return). Targeting
 *  that node auto-crops the snapshot to its bounding box — no whitespace
 *  outside the popup ever makes it into the baseline.
 *
 *  `.first()` is defensive: if a future refactor renders a sibling div
 *  under `#root` (e.g. a portal anchor, a dev overlay), this selector
 *  would otherwise silently match multiple and `toHaveScreenshot` would
 *  pick whichever came first with no warning. `.first()` makes the
 *  ambiguity an explicit contract — the test screenshots the FIRST div,
 *  by design. */
export function popupRoot(page: Page): Locator {
  return page.locator('#root > div').first();
}

/** Options accepted by `openPopup`. The defaults reproduce the original
 *  no-arg behaviour: light color scheme, no other knobs. New options that
 *  belong on every `openPopup` caller should land here. */
export interface OpenPopupOptions {
  /** Browser color-scheme preference Playwright reports to the page.
   *  Drives any `@media (prefers-color-scheme: …)` rules — the Movar
   *  extension's design tokens (packages/ui/src/tokens.css) flip on
   *  exactly this media query, so passing `'dark'` here renders the
   *  popup in dark mode without any setting flip or class toggle. */
  colorScheme?: 'light' | 'dark';
  /** Epoch ms at which to freeze the popup-page clock (`Date.now()`,
   *  `setTimeout`, etc.) via Playwright's `page.clock.install`. Required
   *  for tests that assert on a timestamp the popup writes to storage
   *  (`pauseFor('1h')` writes `Date.now() + 3600_000`) so the assertion
   *  can be exact equality instead of a "≥ now + 1h with margin" lower
   *  bound. The install runs BEFORE navigation — Playwright's clock only
   *  takes effect for code loaded after install.
   *
   *  CONSTRAINT: must be a FUTURE epoch when the test exercises
   *  `pauseFor` (any timed pause). `pauseFor` calls
   *  `chrome.alarms.create({ when: <epoch> })`, which runs in the SW —
   *  whose clock is NOT frozen by `page.clock.install`. If the chosen
   *  epoch is past from the SW's perspective, Chrome fires the alarm
   *  immediately and the SW's onAlarm handler runs `resume()`, nulling
   *  the very timestamp the test is asserting on. Pick something well
   *  into the future (~2049+) and forget about it. */
  clockTime?: number;
}

/**
 * Open the popup at `chrome-extension://<id>/popup.html` and prepare it
 * for assertion / snapshot: pin viewport, emulate reduced motion, wait
 * for fonts, kill transitions, and wait for the popup's first async
 * mount cycle (the useEffect that reads settings + pause + events).
 *
 * Callers must seed any non-default storage BEFORE calling this — the
 * popup reads each value once on mount.
 */
export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  options: OpenPopupOptions = {},
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ ...POPUP_VIEWPORT });
  // `colorScheme: 'light'` is Playwright's default and matches the
  // pre-dark-mode behaviour; pass `'dark'` only when explicitly asked
  // for so the default-light call path stays semantically untouched.
  await page.emulateMedia(
    options.colorScheme === 'dark'
      ? { reducedMotion: 'reduce', colorScheme: 'dark' }
      : { reducedMotion: 'reduce' },
  );
  // Clock setup must precede `goto` — Playwright only intercepts time
  // functions for code loaded after install. `pauseAt` installs the
  // controllable clock AND freezes it at the given epoch (vs plain
  // `install({ time })`, which sets the start time but lets the clock
  // tick on — `Date.now()` then drifts ~10-200ms between install and
  // the popup actually calling it, defeating exact-equality assertions
  // on `pauseFor('1h')`'s persisted `until` value). The popup never
  // needs time to advance during these tests, so a frozen clock is
  // strictly safer.
  if (options.clockTime !== undefined) {
    await page.clock.pauseAt(options.clockTime);
  }
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Wait for React to mount (#root → has a child element). `mountApp` is
  // synchronous-ish; this is sub-50ms in practice but the assertion is
  // cheap insurance against a slow CI worker.
  await page.waitForSelector('#root > *', { state: 'attached' });

  // Belt + braces — emulateMedia handles components that gate on
  // `prefers-reduced-motion`, the injected rule handles components that
  // unconditionally use `transition-*` / `animate-*`. Either alone would
  // leave residual motion in some Tailwind utilities.
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

  // Fonts: the popup uses @fontsource/manrope + ibm-plex-mono via the
  // bundled CSS. A snapshot taken before fonts.ready resolves uses the
  // platform's fallback font — different glyph metrics on macOS vs
  // Linux. Await once explicitly; subsequent reads are cached.
  await page.evaluate(async () => document.fonts.ready);

  return page;
}

/** Pause-state storage keys mirror `apps/extension/src/lib/pause.ts`.
 *  Duplicated here intentionally — coupling the e2e fixture to the
 *  extension's internal module would mean wiring `@movar/extension` as
 *  a workspace dep for two string literals. The keys themselves are part
 *  of the persisted contract, so a rename has to be deliberate anyway. */
const PAUSE_KEYS = {
  until: 'movar:pausedUntil',
  indefinite: 'movar:pausedIndefinitely',
} as const;

const EVENTS_KEY = 'movar:events';

/**
 * Stamp pause state into `chrome.storage.local` from the SW context.
 * Two cases:
 *
 *   - `{ kind: 'indefinite' }` — sets the indefinite flag; the popup
 *     shows the "Resume now" button + "Paused until you resume" text.
 *   - `{ kind: 'timed', untilMs }` — sets `pausedUntil`; the popup
 *     shows the "Resume now" button + a locale-formatted date string.
 *     `untilMs` MUST be in the future relative to `Date.now()` at
 *     popup-mount time, or `getPauseState()` treats it as expired and
 *     reports `paused: false`.
 *   - `{ kind: 'none' }` — clears both keys (the seed-settings step
 *     already does this, so this is mostly explicit-is-better-than-
 *     implicit when a test toggles between paused states).
 */
export async function seedPause(
  serviceWorker: Worker,
  state: { kind: 'indefinite' } | { kind: 'timed'; untilMs: number } | { kind: 'none' },
): Promise<void> {
  await serviceWorker.evaluate(
    async ({ state: s, keys }) => {
      if (s.kind === 'indefinite') {
        await chrome.storage.local.set({
          [keys.indefinite]: true,
          [keys.until]: null,
        });
        return;
      }
      if (s.kind === 'timed') {
        await chrome.storage.local.set({
          [keys.indefinite]: false,
          [keys.until]: s.untilMs,
        });
        return;
      }
      await chrome.storage.local.set({
        [keys.indefinite]: false,
        [keys.until]: null,
      });
    },
    { state, keys: PAUSE_KEYS },
  );
}

/** Seed N synthetic correction events whose timestamps fall inside today
 *  (the popup filters by `timestamp >= startOfDay`). The events are
 *  deterministic by index — same input always produces the same output —
 *  so the corrections-today count is stable across runs. */
export async function seedTodayEvents(serviceWorker: Worker, count: number): Promise<void> {
  await serviceWorker.evaluate(
    async ({ count: n, key, sample }) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      // Spread events one minute apart starting at 00:01, capped at
      // 23:59 to stay inside the day window even when N is large.
      const events = Array.from({ length: n }, (_, i) => ({
        ...sample,
        timestamp: startOfDay.getTime() + Math.min((i + 1) * 60_000, 23 * 3600_000 + 59 * 60_000),
      }));
      await chrome.storage.local.set({ [key]: events });
    },
    {
      count,
      key: EVENTS_KEY,
      sample: {
        domain: 'example.com',
        mechanism: 'redirect',
        fromLang: 'ru',
        toLang: 'uk',
      } satisfies Omit<CorrectionEvent, 'timestamp'> & {
        fromLang: LanguageCode;
        toLang: LanguageCode;
      },
    },
  );
}

/** Convenience: re-export the settings shape so tests don't have to dual-
 *  import from `@movar/settings` and this module. */
export type { MovarSettings } from '@movar/settings';
