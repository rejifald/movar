import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { GoogleWithoutMovarBackdrop } from '../backdrops/google-without-movar';

/**
 * Marketing-site `google-without-movar.png` — the "before" half of the
 * BeforeAfter diptych. Synthesised Google-style SERP at 1280×800
 * showing Russian-language results dominating the top for a Cyrillic
 * query. Replaces the real-Google capture in
 * `apps/extension/scripts/capture-marketing-before-after.mts` so the
 * marketing PNGs no longer depend on live Google ranking drift.
 */
const meta = {
  title: 'Marketing/Screenshots/GoogleSerpWithout',
  component: GoogleWithoutMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 3,
    viewport: { width: 1280, height: 800 },
    captureOutput: { path: 'google-without-movar.png' },
  },
} satisfies Meta<typeof GoogleWithoutMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'ru' } },
  render: () => <GoogleWithoutMovarBackdrop />,
};
