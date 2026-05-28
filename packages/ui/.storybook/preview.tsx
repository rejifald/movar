import type { Preview } from '@storybook/react';

import './preview.css';

/**
 * Global preview config for @movar/ui Storybook.
 *
 * Dark mode rides the existing `@media (prefers-color-scheme: dark)` flip in
 * `tokens.css` — no explicit toolbar toggle. Flip your OS theme to preview
 * the dark surface treatment; this matches how the extension and marketing
 * site decide their theme too, so what you see in Storybook is what ships.
 *
 * `layout: 'centered'` is the default — primitives are small and read better
 * centered on the canvas than glued to the corner. Stories that compose a
 * larger surface (forms, full-width buttons) opt out with `layout: 'padded'`.
 */
const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Primitives',
          ['BrandMark', 'Button', 'IconButton', 'Pill', 'Select', 'Switch', 'Checkbox'],
        ],
      },
    },
  },
};

export default preview;
