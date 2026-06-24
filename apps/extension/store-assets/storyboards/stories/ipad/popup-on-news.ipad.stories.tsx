import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../../src/entrypoints/popup/App';
import { IPAD_13 } from '../../scenes/portrait-diptych-scenes';
import { popupBrowserMock, renderPopupScene } from '../../scenes/popup-on-news-scene';

/** iPad App Store screenshot #1 — Movar popup over a news article (iPad 13″). */
const meta = {
  title: 'Marketplace/IPadScreenshots/PopupOnNews',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    viewport: IPAD_13,
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {
  parameters: { browserMock: popupBrowserMock('en') },
  render: () => renderPopupScene(IPAD_13, 'en'),
};
export const Ukrainian: Story = {
  parameters: { browserMock: popupBrowserMock('uk') },
  render: () => renderPopupScene(IPAD_13, 'uk'),
};
