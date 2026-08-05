import type { Meta, StoryObj } from '@storybook/react';

import { SignalLadder } from './SignalLadder';

/**
 * DOU-article illustration scene — see SteamLanguagesChart.stories.tsx
 * for the `Marketing/Article/*` capture conventions. This scene lands as
 * `docs/articles/assets/signal-ladder.png`.
 */
const meta = {
  title: 'Marketing/Article/SignalLadder',
  component: SignalLadder,
} satisfies Meta<typeof SignalLadder>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ukrainian: Story = {};
