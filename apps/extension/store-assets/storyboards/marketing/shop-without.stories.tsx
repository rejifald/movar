import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { ShopWithoutMovarBackdrop } from '../backdrops/shop-without-movar';

/**
 * Marketing-site `shop-without-movar.png` — the "before" half of the
 * online-shop Examples pair. The fictitious shop _Крамко_ defaults to
 * its Russian edition after a click-through from a Ukrainian search.
 * Captured at natural height in both light and dark (`darkVariant`).
 */
const meta = {
  title: 'Marketing/Screenshots/ShopWithout',
  component: ShopWithoutMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    viewport: { width: 960, height: 800 },
    captureOutput: { path: 'shop-without-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof ShopWithoutMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'ru' } },
  render: () => <ShopWithoutMovarBackdrop />,
};
