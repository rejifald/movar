import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { PickerBackdropUK } from '../backdrops/picker-uk';
import { EnglishBackdropPlaceholder } from './_placeholder';

/**
 * Marketplace screenshot #3 — picker-survivor rework: a third-party
 * language picker with the Russian option dimmed and tagged "Прибрано
 * Movar". The picker IS the foreground; the Movar popup isn't composited
 * here (per `store-assets/STORYBOOK-PIPELINE-PLAN.md` §2's mapping of
 * scenes to backdrops).
 *
 * The backdrop is a pure layout component — no `browser.*` state needs
 * seeding because no popup renders. The mock is still installed via the
 * meta decorator so the global `browser.*` surface is available if some
 * future scene element grows a dependency on it.
 *
 * PR1: Ukrainian only. English is placeholder + `skip-capture`.
 */
const meta = {
  title: 'Marketplace/Screenshots/PickerSurvivor',
  component: PickerBackdropUK,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 3,
  },
} satisfies Meta<typeof PickerBackdropUK>;

export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = {
  tags: ['skip-capture'],
  parameters: {
    browserMock: { uiLanguage: 'en-US' },
  },
  render: () => <EnglishBackdropPlaceholder scene="Picker survivor rework" />,
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: { uiLanguage: 'uk' },
  },
  render: () => <PickerBackdropUK />,
};
