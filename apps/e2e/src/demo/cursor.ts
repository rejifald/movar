/**
 * Inject a visible cursor follower into pages opened by the recording suite.
 *
 * Why this exists: Playwright's `page.mouse.move/click/…` dispatches real
 * synthetic mouse events but the host browser never paints a system cursor
 * for them — videos show the popup opening "by magic". A small DOM-side
 * follower listens for the same mousemove events and renders a dot that
 * tracks the simulated cursor 1:1.
 *
 * Scope:
 *   - `addInitScript` runs in every frame on every navigation. We gate on
 *     `window.top === window` so subframes (ads, embedded YouTube players)
 *     don't get a second cursor.
 *   - The follower sits at `z-index: 2147483647` (max signed 32-bit int)
 *     so site overlays don't bury it; tinted blue with a white ring so it
 *     reads against both light and dark backgrounds.
 *   - Click animates a brief scale-down so the viewer can see *when* a
 *     click landed, which matters for the captioned beats.
 */
import type { Page } from '@playwright/test';

export async function installVisibleCursor(page: Page): Promise<void> {
  // The init script body runs inside the browser page context, not Node.
  // `window` is the canonical reference there (typed as `Window`), and
  // `attach` is a runtime closure that can't be hoisted out of the
  // browser scope — silence the two unicorn opinions accordingly.
  /* eslint-disable unicorn/prefer-global-this, unicorn/consistent-function-scoping */
  await page.addInitScript(() => {
    // Skip subframes — a page with a YouTube embed would otherwise paint
    // two cursors stacked.
    if (window.top !== window) return;
    const attach = (): void => {
      const cursor = document.createElement('div');
      cursor.id = '__movar_demo_cursor__';
      cursor.style.cssText = [
        'position: fixed',
        'left: 0',
        'top: 0',
        'z-index: 2147483647',
        'pointer-events: none',
        'width: 22px',
        'height: 22px',
        'margin-left: -11px',
        'margin-top: -11px',
        'border-radius: 50%',
        'background: rgba(56, 132, 255, 0.65)',
        'border: 2px solid #ffffff',
        'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35)',
        'transition: transform 80ms ease-out',
        'will-change: transform',
      ].join(';');
      document.documentElement.appendChild(cursor);

      // Track real coordinates; transform is cheaper than setting left/top
      // every frame and avoids layout thrash on long pages.
      document.addEventListener(
        'mousemove',
        (e) => {
          cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        },
        { capture: true, passive: true },
      );
      // Briefly squish on click — the viewer needs an unambiguous "tap"
      // moment for the captions to land on.
      document.addEventListener(
        'mousedown',
        () => {
          cursor.style.transform += ' scale(0.6)';
        },
        { capture: true, passive: true },
      );
      document.addEventListener(
        'mouseup',
        () => {
          cursor.style.transform = cursor.style.transform.replace(/ scale\([^)]+\)/, '');
        },
        { capture: true, passive: true },
      );
    };
    // `documentElement` exists from `document_start`, and `attach` only appends
    // there + adds document-level listeners, so it is always safe to run now.
    attach();
  });
  /* eslint-enable unicorn/prefer-global-this, unicorn/consistent-function-scoping */
}

/**
 * Move the simulated mouse along a path of waypoints, pausing at each so
 * the cursor follower has frames to render. Direct `mouse.move(x, y)`
 * jumps in a single tick — most recording cadences (30 fps) would show no
 * motion at all. The `steps` arg interpolates so the move animates.
 *
 * `dwellMs` defaults to 250 ms — about half a beat at 30 fps, enough for
 * the viewer to register the cursor arrived before the next click fires.
 */
export async function moveTo(
  page: Page,
  x: number,
  y: number,
  options: { steps?: number; dwellMs?: number } = {},
): Promise<void> {
  const { steps = 12, dwellMs = 250 } = options;
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(dwellMs);
}
