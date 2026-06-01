import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { GoogleGodOfWarWithMovarContent } from '../backdrops/google-god-of-war-with-movar';
import { GoogleGodOfWarWithoutMovarContent } from '../backdrops/google-god-of-war-without-movar';

/**
 * Marketplace screenshot #5 — Knowledge-Panel rewrite. Same backdrop
 * pair the marketing diptych's second pair uses
 * (`Marketing/Screenshots/GoogleGodOfWar{With,Without}`), wrapped in
 * `BeforeAfterFrameWithFrame` so the diptych composition reads as
 * "Movar localises Google's entity card to your language."
 *
 * Why UK-only: the demo's premise is that Google falls back to
 * English for Latin-script queries without an `hl` hint. For an EN
 * locale user, both before and after halves would render in English
 * — Movar's appended `hl=en&lr=lang_en` is what Google would have
 * defaulted to anyway. The narrative only fires when the user's
 * priority language is something other than English. So this file
 * exports `Ukrainian` only; the EN marketplace listing ships four
 * screenshots, the UK listing ships five.
 *
 * Per-locale PNG lands at `screenshots/uk/05-knowledge-panel.png`.
 */
const meta = {
  title: 'Marketplace/Screenshots/KnowledgePanel',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 5,
  },
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'uk',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

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
        body: 'Латинський запит «God of War» на google.com.ua — без hl Google віддає Knowledge Panel і результати англійською.',
        urlBar: <>google.com.ua/search?q=God+of+War</>,
        content: <GoogleGodOfWarWithoutMovarContent />,
        variant: 'before',
      }}
      after={{
        label: 'З Movar',
        body: 'Той самий запит. Movar додає hl=uk&lr=lang_uk — Knowledge Panel і список результатів перемикаються на українську.',
        urlBar: (
          <>
            google.com.ua/search?q=God+of+War&amp;<mark>hl=uk</mark>&amp;<mark>lr=lang_uk</mark>
          </>
        ),
        content: <GoogleGodOfWarWithMovarContent />,
        variant: 'after',
      }}
    />
  ),
};
