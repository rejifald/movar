import type { Preview } from '@storybook/react';

import './preview.css';

/**
 * Global preview config for the marketing Storybook.
 *
 * Sections are page-sized, not primitive-sized — layout defaults to
 * `'fullscreen'` so a story renders edge-to-edge, matching how the section
 * sits on the live marketing page. Stories that want padding opt in
 * locally with `parameters: { layout: 'padded' }`.
 *
 * Dark mode rides `@movar/ui`'s tokens.css `prefers-color-scheme` flip. No
 * toolbar toggle here — change your OS theme to preview dark, matching how
 * the marketing site and the extension decide their theme too.
 *
 * Maintenance: every story file is a React re-implementation of the
 * sibling `.astro` component. When the `.astro` changes, the matching
 * `.stories.tsx` needs the same edit. Code review is the drift-detection
 * net. If divergence gets meaningful, swap to a community Astro framework
 * for Storybook and delete the React mocks.
 */
const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Marketing',
          [
            'Hero',
            'Problem',
            'Stakes',
            'HowItWorks',
            'Examples',
            'BeforeAfter',
            'Limitations',
            'Privacy',
            'Close',
            'Header',
            'Footer',
            'DownloadButtons',
            'OG',
            'Social',
          ],
        ],
      },
    },
  },
};

export default preview;
