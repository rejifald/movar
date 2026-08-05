import type { Meta, StoryObj } from '@storybook/react';

import { SteamLanguagesChart } from './SteamLanguagesChart';

/**
 * Stories under `Marketing/Article/*` are the source of the DOU-article
 * illustration PNGs. `scripts/capture-article-assets.mts` filters this
 * prefix and writes `docs/articles/assets/<kebab-cased-scene>.png` —
 * this scene lands as `steam-languages.png`.
 *
 * Article assets are Ukrainian-only (the article targets dou.ua), so the
 * single story is named `Ukrainian` for symmetry with the OG capture
 * convention.
 */
const meta = {
  title: 'Marketing/Article/SteamLanguages',
  component: SteamLanguagesChart,
} satisfies Meta<typeof SteamLanguagesChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ukrainian: Story = {};
