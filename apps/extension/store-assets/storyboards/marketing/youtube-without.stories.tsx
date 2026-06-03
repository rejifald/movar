import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { YouTubeWithoutMovarBackdrop } from '../backdrops/youtube-without-movar';

/**
 * Marketing-site `youtube-without-movar.png` — the "before" half of the
 * YouTube Examples pair. A Ukrainian-language search whose
 * recommendations skew Russian because no language/region hint is in
 * flight. Captured at natural height (Marketing prefix) in both light
 * and dark (`darkVariant`).
 */
const meta = {
  title: 'Marketing/Screenshots/YouTubeWithout',
  component: YouTubeWithoutMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    viewport: { width: 936, height: 800 },
    captureOutput: { path: 'youtube-without-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof YouTubeWithoutMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <YouTubeWithoutMovarBackdrop />,
};
