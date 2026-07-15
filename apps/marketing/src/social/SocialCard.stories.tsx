import type { Meta, StoryObj } from '@storybook/react';

import { SocialCard } from './SocialCard';
import type { Locale } from '../i18n';

/**
 * Stories under `Marketing/Social/*` are the source of the per-locale
 * portrait social-post PNGs. `scripts/capture-social-cards.mts` filters
 * this prefix, navigates Playwright to each story at the 1080×1350
 * viewport, and writes `apps/marketing/public/social/<lang>/NN-<slug>.png`.
 *
 * Conventions the capture script depends on (identical to the OG pipeline):
 *   - `parameters.screenshotIndex` on `meta` — numeric filename prefix.
 *     Bump when adding a new scene.
 *   - Story name is `English` or `Ukrainian` — mapped to the `en` / `uk`
 *     output folders.
 *   - The scene title after `Marketing/Social/` is kebab-cased into the
 *     filename slug (`MeetMovar` → `meet-movar`).
 *
 * Adding a new card = add a `.stories.tsx` here with the next free
 * `screenshotIndex`, run `pnpm --filter @movar/marketing capture:social`,
 * and reference it from a post's `image:` frontmatter.
 */
const meta = {
  title: 'Marketing/Social/MeetMovar',
  component: SocialCard,
  parameters: {
    screenshotIndex: 1,
  },
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof SocialCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
