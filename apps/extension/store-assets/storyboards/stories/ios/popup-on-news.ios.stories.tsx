import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../../src/entrypoints/popup/App';
import { IPHONE_69 } from '../../scenes/portrait-diptych-scenes';
import { popupBrowserMock, renderPopupScene } from '../../scenes/popup-on-news-scene';

/** iOS App Store screenshot #1 — Movar popup over a news article (iPhone 6.9″). */
const meta = {
  title: 'Marketplace/IOSScreenshots/PopupOnNews',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    viewport: IPHONE_69,
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {
  parameters: { browserMock: popupBrowserMock('en') },
  render: () => renderPopupScene(IPHONE_69, 'en'),
};
export const Ukrainian: Story = {
  parameters: { browserMock: popupBrowserMock('uk') },
  render: () => renderPopupScene(IPHONE_69, 'uk'),
};
