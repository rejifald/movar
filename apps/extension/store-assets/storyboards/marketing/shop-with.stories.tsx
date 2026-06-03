import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { ShopWithMovarBackdrop } from '../backdrops/shop-with-movar';

/**
 * Marketing-site `shop-with-movar.png` — the "after" half of the
 * online-shop Examples pair. Movar's Accept-Language hint opens the
 * shop's Ukrainian edition; the whole page follows. Captured at natural
 * height in both light and dark (`darkVariant`).
 */
const meta = {
  title: 'Marketing/Screenshots/ShopWith',
  component: ShopWithMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    viewport: { width: 960, height: 800 },
    captureOutput: { path: 'shop-with-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof ShopWithMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <ShopWithMovarBackdrop />,
};
