import type { Meta, StoryObj } from '@storybook/react';

import type { MovarSettings } from '@movar/shared';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/options/App';

/**
 * Marketing-site `options.png` thumbnail — the extension's full
 * options page at the 1280×800 size declared in
 * `apps/marketing/public/screenshots/README.md`. Renders the real
 * `entrypoints/options/App` over the standard `withBrowserMock`
 * decorator, seeded with a three-language priority list so the
 * scene reads as "user has personalised their preferences" rather
 * than the bare default.
 *
 * Why three languages: the README scenario calls for "priority list
 * with edited priority list", and the default ships with only
 * `['uk', 'en']`. Adding `pl` shows the section being actively
 * configured without bloating the priority list past the visual
 * top of the page.
 *
 * The allowlist is also pre-seeded so the AllowlistSection rows
 * are not empty — the marketing screenshot is meant to show the
 * options page in use, not in its first-run state.
 */
const meta = {
  title: 'Marketing/Screenshots/Options',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 2,
    viewport: { width: 1280, height: 800 },
    captureOutput: { path: 'options.png' },
  },
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

const seededSettings: MovarSettings = {
  enabled: true,
  // Three-language priority list — uk first, en second, pl as the
  // visible "user has been tweaking this" addition.
  priority: ['uk', 'en', 'pl'],
  blocked: ['ru'],
  // One allowlist entry so the Allowlist section reads as "in use".
  allowlist: ['nytimes.com'],
  contentModification: true,
  diagnostics: false,
  uiLanguage: 'uk',
};

export const Default: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: {
        sync: { settings: seededSettings },
      },
    },
  },
  render: () => <App />,
};
