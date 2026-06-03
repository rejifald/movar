import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { GoogleWithMovarBackdrop } from '../backdrops/google-with-movar';

/**
 * Marketing-site `google-with-movar.png` — the "after" half of the
 * BeforeAfter diptych. Synthesised Google-style SERP at 1280×800
 * showing Ukrainian-language results pinned to the top after Movar
 * appends `&hl=uk&lr=lang_uk` (highlighted in the URL bar).
 *
 * Pair with `google-serp-without.stories.tsx` — both render at the
 * same dimensions through the shared `GoogleSerpFrame` so the only
 * visible delta between the captured PNGs is the result list, which
 * is exactly what the BeforeAfter section's rhetoric leans on.
 */
const meta = {
  title: 'Marketing/Screenshots/GoogleSerpWith',
  component: GoogleWithMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 4,
    viewport: { width: 744, height: 800 },
    captureOutput: { path: 'google-with-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof GoogleWithMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <GoogleWithMovarBackdrop />,
};
