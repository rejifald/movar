import type { Meta, StoryObj } from '@storybook/react';

import { OgCard } from './OgCard';
import type { Locale } from '../i18n';

/**
 * Stories under `Marketing/OG/*` are the source of the per-locale Open
 * Graph PNGs. `scripts/capture-og-images.mts` filters this prefix,
 * navigates Playwright to each story at the 1200×630 viewport, and writes
 * `apps/marketing/public/og/<lang>/01-default.png`.
 *
 * Conventions the capture script depends on:
 *   - `parameters.screenshotIndex` on `meta` — numeric filename prefix.
 *     Bump when adding a new scene above.
 *   - Story name is `English` or `Ukrainian` — the script maps these to
 *     the `en` / `uk` output folders.
 *
 * Layout is `fullscreen` (inherited from `.storybook/preview.tsx`) so the
 * 1200×630 card sits flush in the iframe canvas.
 */
const meta = {
  title: 'Marketing/OG/Default',
  component: OgCard,
  parameters: {
    screenshotIndex: 1,
  },
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof OgCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
