import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { GoogleGodOfWarWithoutMovarBackdrop } from '../backdrops/google-god-of-war-without-movar';

/**
 * Marketing-site `google-god-of-war-without-movar.png` — the "before"
 * half of the second BeforeAfter diptych. Synthesised Google SERP at
 * 1280×800 showing a Latin-script query ("God of War") with the
 * Knowledge Panel on the right rendered in English. Captures the
 * scenario where Google has no `hl` hint and falls back to its
 * canonical English entity data for the franchise.
 *
 * Pair with `google-god-of-war-with.stories.tsx` — both use the
 * shared `GoogleKnowledgeFrame` so the only visible delta between
 * the captured PNGs is the URL bar params + the language of the
 * results column and Knowledge Panel.
 */
const meta = {
  title: 'Marketing/Screenshots/GoogleGodOfWarWithout',
  component: GoogleGodOfWarWithoutMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 5,
    viewport: { width: 1280, height: 800 },
    captureOutput: { path: 'google-god-of-war-without-movar.png' },
  },
} satisfies Meta<typeof GoogleGodOfWarWithoutMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <GoogleGodOfWarWithoutMovarBackdrop />,
};
