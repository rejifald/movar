import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPHONE_69, KNOWLEDGE, renderScene } from '../../scenes/portrait-diptych-scenes';

/**
 * iOS App Store screenshot #5 — Google knowledge panel (iPhone 6.9″).
 * UK-only, same as the landscape scene: the English-fallback premise
 * produces no before/after delta for an English-priority user.
 */
const meta = {
  title: 'Marketplace/IOSScreenshots/KnowledgePanel',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: KNOWLEDGE.index,
    darkVariant: KNOWLEDGE.darkVariant,
    viewport: IPHONE_69,
  },
  args: {
    ...IPHONE_69,
    lang: 'uk',
    headline: '',
    before: { label: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', urlBar: null, content: null, variant: 'after' },
  } satisfies PortraitBeforeAfterFrameProps,
} satisfies Meta<typeof PortraitBeforeAfterFrameWithFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ukrainian: Story = { render: () => renderScene(IPHONE_69, 'uk', KNOWLEDGE) };
