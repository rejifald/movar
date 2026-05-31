import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { VoyaBackdrop, VOYA_URL, buildBlockedVoyaContent } from '../backdrops/voya-frame';
import { VoyaBackdropEN } from '../backdrops/voya-en';
import { VoyaBackdropUK } from '../backdrops/voya-uk';

/**
 * Marketplace screenshot #4 — language-dialog diptych. A fictitious
 * international travel site (*Voya*) on first visit:
 *
 *   - Without Movar: the site detects the request as a generic
 *     visitor and serves Russian as its locked default. A modal
 *     dialog blocks the page asking the user to pick a language.
 *   - With Movar: the site sees `Accept-Language` upfront, recognises
 *     the preferred language, and serves the right variant directly.
 *     No modal — the user gets to the content.
 *
 * Movar's actual mechanism here: it sets the `Accept-Language` header
 * via declarative net request rules. Sites that respect the header
 * (most CMS-driven international sites do) skip the locale prompt
 * because the preference is already on the request. The diptych
 * dramatises this — same site, same URL, two outcomes depending on
 * whether the header is set.
 *
 * Layout: standard `BeforeAfterFrame` — browser chrome at top,
 * scaled content middle, caption bottom. Same URL on both halves
 * (Movar doesn't change URLs; only the request header).
 *
 * Per-locale PNGs land at `screenshots/{en,uk}/04-language-dialog.png`.
 */
const meta = {
  title: 'Marketplace/Screenshots/LanguageDialog',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 4,
  },
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'en',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Per-locale blocked half. The dialog's "preferred" option matches
 *  the story's locale, so each scene shows the user's actual binary
 *  ("stay in Russian (blocked) vs switch to my real preference"). */
const BLOCKED_EN = buildBlockedVoyaContent('en');
const BLOCKED_UK = buildBlockedVoyaContent('uk');

export const English: Story = {
  parameters: {
    browserMock: { uiLanguage: 'en-US' },
  },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="en"
      contentNativeHeight={920}
      before={{
        label: 'Without Movar',
        body: 'Voya defaults to Russian and blocks the page with a "Choose your language" prompt before anything else loads.',
        urlBar: VOYA_URL,
        content: <VoyaBackdrop content={BLOCKED_EN.content} dialog={BLOCKED_EN.dialog} />,
        variant: 'before',
      }}
      after={{
        label: 'With Movar',
        body: 'Movar sends Accept-Language with every request. Voya reads the preference, serves the English variant, and skips the prompt.',
        urlBar: VOYA_URL,
        content: <VoyaBackdropEN />,
        variant: 'after',
      }}
    />
  ),
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: { uiLanguage: 'uk' },
  },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="uk"
      contentNativeHeight={920}
      before={{
        label: 'Без Movar',
        body: 'Voya за замовчуванням російською і блокує сторінку вікном «Виберіть мову» — поки користувач не обере.',
        urlBar: VOYA_URL,
        content: <VoyaBackdrop content={BLOCKED_UK.content} dialog={BLOCKED_UK.dialog} />,
        variant: 'before',
      }}
      after={{
        label: 'З Movar',
        body: 'Movar надсилає Accept-Language з кожним запитом. Voya читає вподобання, віддає українську версію та пропускає вікно.',
        urlBar: VOYA_URL,
        content: <VoyaBackdropUK />,
        variant: 'after',
      }}
    />
  ),
};
