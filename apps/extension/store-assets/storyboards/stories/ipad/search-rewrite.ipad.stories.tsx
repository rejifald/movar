import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPAD_13, SEARCH_REWRITE, renderScene } from '../../scenes/portrait-diptych-scenes';

/** iPad App Store screenshot #3 — Google search rewrite (iPad 13″). */
const meta = {
  title: 'Marketplace/IPadScreenshots/SearchRewrite',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: SEARCH_REWRITE.index,
    darkVariant: SEARCH_REWRITE.darkVariant,
    viewport: IPAD_13,
  },
  args: {
    ...IPAD_13,
    lang: 'en',
    headline: '',
    before: { label: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', urlBar: null, content: null, variant: 'after' },
  } satisfies PortraitBeforeAfterFrameProps,
} satisfies Meta<typeof PortraitBeforeAfterFrameWithFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = { render: () => renderScene(IPAD_13, 'en', SEARCH_REWRITE) };
export const Ukrainian: Story = { render: () => renderScene(IPAD_13, 'uk', SEARCH_REWRITE) };
