import type { Meta, StoryObj } from '@storybook/react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { IPAD_13, LANGUAGE_DIALOG, renderScene } from '../../scenes/portrait-diptych-scenes';

/** iPad App Store screenshot #4 — language dialog (iPad 13″). */
const meta = {
  title: 'Marketplace/IPadScreenshots/LanguageDialog',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: LANGUAGE_DIALOG.index,
    darkVariant: LANGUAGE_DIALOG.darkVariant,
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

export const English: Story = { render: () => renderScene(IPAD_13, 'en', LANGUAGE_DIALOG) };
export const Ukrainian: Story = { render: () => renderScene(IPAD_13, 'uk', LANGUAGE_DIALOG) };
