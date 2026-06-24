import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPAD_13, KNOWLEDGE, renderScene } from '../../scenes/portrait-diptych-scenes';

/** iPad App Store screenshot #5 — Google knowledge panel (iPad 13″, UK-only). */
const meta = {
  title: 'Marketplace/IPadScreenshots/KnowledgePanel',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: KNOWLEDGE.index,
    darkVariant: KNOWLEDGE.darkVariant,
    viewport: IPAD_13,
  },
  args: {
    ...IPAD_13,
    lang: 'uk',
    headline: '',
    before: { label: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', urlBar: null, content: null, variant: 'after' },
  } satisfies PortraitBeforeAfterFrameProps,
} satisfies Meta<typeof PortraitBeforeAfterFrameWithFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ukrainian: Story = { render: () => renderScene(IPAD_13, 'uk', KNOWLEDGE) };
