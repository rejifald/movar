import type { Meta, StoryObj } from '@storybook/react';

import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/onboarding/App';

/**
 * The first-run onboarding page (`entrypoints/onboarding`), dev-preview
 * only — lives under `Components/*` (not `Marketplace|Marketing|Promo/*`),
 * so `capture-storybook-assets.mts` ignores it. Each story renders the
 * real `App` over `withBrowserMock`, seeded via the mock's new
 * `permissions` field (see `src/test/browser-mock.ts`) so the access
 * step's granted/missing lines are reachable without a real
 * `browser.permissions` API.
 *
 * Only the Chromium/Firefox-shaped flow (`pin` optional + `access`) is
 * reachable here: `resolveFlow` reads `import.meta.env.BROWSER`, which
 * Storybook's Vite build always resolves to `'chrome'` (WXT only injects a
 * different value inside an actual per-target `wxt build`) — there's no
 * prop seam on `App` to force the Safari/`enable` flow. Chromium/Firefox
 * is what the large majority of installs go through, so it's the state
 * worth eyeballing pixel-for-pixel; the e2e visual suite
 * (`apps/e2e/src/offline/onboarding.visual.spec.ts`) covers the same
 * granted state against the real built extension, and this file picks up
 * the states that suite can't reach (missing permission — the e2e build
 * forces `<all_urls>` as a required permission, so it's always granted
 * there).
 */
const ENGLISH_FIRST: MovarSettings = { ...defaultSettings, priority: ['en', 'uk'] };
const UKRAINIAN_FIRST: MovarSettings = { ...defaultSettings, priority: ['uk', 'en'] };

const meta = {
  title: 'Components/Onboarding',
  component: App,
  decorators: [withBrowserMock],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AccessGranted: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: { sync: { settings: ENGLISH_FIRST } },
      permissions: { granted: true },
    },
  },
};

export const AccessMissing: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: { sync: { settings: ENGLISH_FIRST } },
      permissions: { granted: false },
    },
  },
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: { sync: { settings: UKRAINIAN_FIRST } },
      permissions: { granted: true },
    },
  },
};
