import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { YouTubeWithMovarBackdrop } from '../backdrops/youtube-with-movar';

/**
 * Marketing-site `youtube-with-movar.png` — the "after" half of the
 * YouTube Examples pair. Same interface and query; Movar's language and
 * region hints bring Ukrainian creators to the top. Captured at natural
 * height in both light and dark (`darkVariant`).
 */
const meta = {
  title: 'Marketing/Screenshots/YouTubeWith',
  component: YouTubeWithMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    viewport: { width: 936, height: 800 },
    captureOutput: { path: 'youtube-with-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof YouTubeWithMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <YouTubeWithMovarBackdrop />,
};
