import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { ShopFrame } from '../backdrops/shop-frame';
import { SHOP_WITHOUT_CONTENT, shopWithoutUrlBar } from '../backdrops/shop-without-movar';
import { SHOP_WITH_CONTENT, shopWithUrlBar } from '../backdrops/shop-with-movar';

/**
 * Marketplace screenshot #7 — Ukrainian online shop. The user clicked
 * through from a Ukrainian search. On the Before half the fictitious
 * shop _Крамко_ defaults to its Russian edition (`/ru/`, РУ pill
 * active); on the After half Movar's Accept-Language hint opens the
 * Ukrainian edition (`/ua/`, УК pill active) and the whole page
 * follows. Reuses the marketing single-halves' content so the surfaces
 * stay in step.
 *
 * Captured in both light and dark (`darkVariant`). Per-locale PNGs land
 * at `screenshots/{en,uk}/07-shop.png` (+ `-dark`).
 */
const meta = {
  title: 'Marketplace/Screenshots/Shop',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 7,
    darkVariant: true,
  },
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'en',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Native vertical extent for the scaled shop page. */
const NATIVE_H = 880;

function withoutContent(): JSX.Element {
  return <ShopFrame lang="ru" hideChrome content={SHOP_WITHOUT_CONTENT} />;
}

function withContent(): JSX.Element {
  return <ShopFrame lang="uk" hideChrome content={SHOP_WITH_CONTENT} />;
}

export const English: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="en"
      contentNativeHeight={NATIVE_H}
      before={{
        label: 'Without Movar',
        body: 'Clicked through from a Ukrainian search — but the shop loads its Russian edition by default.',
        urlBar: shopWithoutUrlBar(),
        content: withoutContent(),
        variant: 'before',
      }}
      after={{
        label: 'With Movar',
        body: 'Movar’s Accept-Language hint opens the shop’s Ukrainian edition instead. The whole page follows.',
        urlBar: shopWithUrlBar(),
        content: withContent(),
        variant: 'after',
      }}
    />
  ),
};

export const Ukrainian: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="uk"
      contentNativeHeight={NATIVE_H}
      before={{
        label: 'Без Movar',
        body: 'Перехід з україномовного пошуку — але магазин відкриває російську версію за замовчуванням.',
        urlBar: shopWithoutUrlBar(),
        content: withoutContent(),
        variant: 'before',
      }}
      after={{
        label: 'З Movar',
        body: 'Підказка Accept-Language від Movar відкриває українську версію магазину. Уся сторінка — українською.',
        urlBar: shopWithUrlBar(),
        content: withContent(),
        variant: 'after',
      }}
    />
  ),
};
