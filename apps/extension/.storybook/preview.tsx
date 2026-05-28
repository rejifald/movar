import type { Preview } from '@storybook/react';

import { installBrowserMock } from '../src/test/browser-mock';
import './preview.css';

// Install a baseline mock at preview-module load so the popup's
// `import { browser } from 'wxt/browser'` captures our shim. The
// `withBrowserMock` decorator re-installs per-story state at render
// time, but `@wxt-dev/browser`'s `browser` export is a const that
// snapshots `globalThis.chrome` at the import statement — by the time
// the decorator runs, the popup module has already loaded. The shim's
// identity is stable across re-installs (see `src/test/browser-mock.ts`),
// so this default plus the decorator's reset land on the same object.
installBrowserMock();

/**
 * Global preview config for the extension Storybook.
 *
 * Scenes are page-sized — layout defaults to `'fullscreen'` so the
 * backdrop + popup composite renders edge-to-edge at the 1280×800
 * marketplace size. The Playwright capture script sets the viewport at
 * exactly that size and screenshots the rendered scene; any padding here
 * would shrink the captured PNG below the marketplace spec.
 *
 * `parameters.browserMock` on each story drives the shared
 * `installBrowserMock` in `src/test/browser-mock.ts` via the
 * `withBrowserMock` decorator at
 * `.storybook/decorators/with-browser-mock.tsx`. Stories that don't set
 * the parameter still load — the decorator no-ops and the popup falls
 * back to its empty-state branches.
 *
 * Dark mode rides `@movar/ui`'s tokens.css `prefers-color-scheme` flip,
 * matching how the extension and the marketing Storybook handle the
 * theme too — no toolbar toggle here.
 */
const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      // Order the Marketplace/Screenshots/* entries by the numbered index
      // the capture script writes to PNG filenames. Keeps the Storybook
      // sidebar reading the same way as the captured screenshot set.
      storySort: {
        order: [
          'Marketplace',
          ['Screenshots', ['PopupOnNews', 'CorrectionApplied', 'PickerSurvivor', 'SearchRewrite']],
        ],
      },
    },
  },
};

export default preview;
