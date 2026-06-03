import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { GoogleGodOfWarWithMovarBackdrop } from '../backdrops/google-god-of-war-with-movar';

/**
 * Marketing-site `google-god-of-war-with-movar.png` — the "after"
 * half of the second BeforeAfter diptych. Same `God of War` query
 * as the without-Movar half, but with `&hl=uk&lr=lang_uk` appended
 * (highlighted in the URL bar). The Knowledge Panel on the right
 * localises to Ukrainian — title stays in the franchise's original
 * Latin form, but description, properties, and "people also search
 * for" tiles all switch.
 *
 * Pair with `google-god-of-war-without.stories.tsx` — see that file
 * for the diptych-level rationale.
 */
const meta = {
  title: 'Marketing/Screenshots/GoogleGodOfWarWith',
  component: GoogleGodOfWarWithMovarBackdrop,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 6,
    viewport: { width: 1074, height: 800 },
    captureOutput: { path: 'google-god-of-war-with-movar.png' },
    darkVariant: true,
    naturalHeight: true,
  },
} satisfies Meta<typeof GoogleGodOfWarWithMovarBackdrop>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => <GoogleGodOfWarWithMovarBackdrop />,
};
