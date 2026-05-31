import type { StorybookConfig } from '@storybook/react-vite';

import { sharedStorybookConfig } from './shared-main-config';

/**
 * Storybook config for @movar/ui — the single canvas where every primitive
 * gets exercised in isolation.
 *
 *   - **Stories live next to components.** Story files use the
 *     `<name>.stories.tsx` sibling pattern so a primitive and its examples
 *     evolve together. Matches the test-file convention used elsewhere in
 *     the repo.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  ...sharedStorybookConfig,
};

export default config;
