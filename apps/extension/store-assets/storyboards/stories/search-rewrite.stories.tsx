import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { SerpBackdropUK } from '../backdrops/serp-uk';
import { EnglishBackdropPlaceholder } from './_placeholder';

/**
 * Marketplace screenshot #4 — search rewrite: a fictitious search engine
 * (*Vector*) showing Ukrainian results with `?hl=uk` highlighted in the
 * URL bar. The SERP is the foreground; the Movar popup isn't composited
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
  title: 'Marketplace/Screenshots/SearchRewrite',
  component: SerpBackdropUK,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 4,
  },
} satisfies Meta<typeof SerpBackdropUK>;

export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = {
  tags: ['skip-capture'],
  parameters: {
    browserMock: { uiLanguage: 'en-US' },
  },
  render: () => <EnglishBackdropPlaceholder scene="Search rewrite" />,
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: { uiLanguage: 'uk' },
  },
  render: () => <SerpBackdropUK />,
};
