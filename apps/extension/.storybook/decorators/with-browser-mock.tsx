import type { Decorator } from '@storybook/react';

import { installBrowserMock, type BrowserMockState } from '../../src/test/browser-mock';

/**
 * Per-story WebExtension API mock decorator.
 *
 * Reads `parameters.browserMock` (typed `BrowserMockState`) and re-installs
 * the shared `installBrowserMock` from `src/test/browser-mock.ts` before
 * the story renders. Re-running on every story switch is intentional: the
 * mock owns its own in-memory storage Maps, so switching from `Ukrainian`
 * to `English` (with different `storage.sync.settings`) replaces the seed
 * cleanly without any cross-story state leakage.
 *
 * The same `installBrowserMock` runs in the static-serve preview, bundled
 * by the wxt `build:done` hook via `preview/preview-shim-entry.ts`. Both
 * surfaces exercise exactly one mock implementation — see
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §3.
 */
export const withBrowserMock: Decorator = (Story, ctx) => {
  const state = ctx.parameters['browserMock'] as BrowserMockState | undefined;
  installBrowserMock(state ?? {});
  return <Story />;
};
