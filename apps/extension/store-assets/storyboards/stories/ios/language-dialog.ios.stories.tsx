import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPHONE_69, LANGUAGE_DIALOG, renderScene } from '../../scenes/portrait-diptych-scenes';

/** iOS App Store screenshot #4 — language dialog (iPhone 6.9″). */
const meta = {
  title: 'Marketplace/IOSScreenshots/LanguageDialog',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: LANGUAGE_DIALOG.index,
    darkVariant: LANGUAGE_DIALOG.darkVariant,
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

export const English: Story = { render: () => renderScene(IPHONE_69, 'en', LANGUAGE_DIALOG) };
export const Ukrainian: Story = { render: () => renderScene(IPHONE_69, 'uk', LANGUAGE_DIALOG) };
