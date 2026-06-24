import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPHONE_69, YOUTUBE, renderScene } from '../../scenes/portrait-diptych-scenes';

/** iOS App Store screenshot #6 — YouTube recommendations (iPhone 6.9″). */
const meta = {
  title: 'Marketplace/IOSScreenshots/Youtube',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: YOUTUBE.index,
    darkVariant: YOUTUBE.darkVariant,
    viewport: IPHONE_69,
  },
  args: {
    ...IPHONE_69,
    lang: 'en',
    headline: '',
    before: { label: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', urlBar: null, content: null, variant: 'after' },
  } satisfies PortraitBeforeAfterFrameProps,
} satisfies Meta<typeof PortraitBeforeAfterFrameWithFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = { render: () => renderScene(IPHONE_69, 'en', YOUTUBE) };
export const Ukrainian: Story = { render: () => renderScene(IPHONE_69, 'uk', YOUTUBE) };
