import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { YouTubeFrame } from '../backdrops/youtube-frame';
import {
  YT_CHIPS,
  YT_QUERY,
  YouTubeWithoutVideos,
  youtubeUrlBar,
} from '../backdrops/youtube-without-movar';
import { YouTubeWithVideos } from '../backdrops/youtube-with-movar';

/**
 * Marketplace screenshot #6 — YouTube recommendations. Both halves
 * share the same Ukrainian interface, the same Cyrillic query, and the
 * same URL: Movar never changes YouTube's UI language, only the
 * language/region hints that steer which creators get recommended. The
 * only delta a viewer sees is the video list — Russian-leaning channels
 * on the Before half, Ukrainian creators on the After half. Reuses the
 * exact video lists from the marketing single-halves so the two
 * surfaces stay in step.
 *
 * Captured in both light and dark (`darkVariant`). Per-locale PNGs land
 * at `screenshots/{en,uk}/06-youtube.png` (+ `-dark`).
 */
const meta = {
  title: 'Marketplace/Screenshots/Youtube',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 6,
    darkVariant: true,
  },
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'en',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Native vertical extent for the scaled YouTube content — sized so
 *  roughly four video cards read inside the diptych's content area. */
const NATIVE_H = 880;

function withoutContent(): JSX.Element {
  return (
    <YouTubeFrame lang="uk" query={YT_QUERY} chips={YT_CHIPS} hideChrome>
      {YouTubeWithoutVideos()}
    </YouTubeFrame>
  );
}

function withContent(): JSX.Element {
  return (
    <YouTubeFrame lang="uk" query={YT_QUERY} chips={YT_CHIPS} hideChrome>
      {YouTubeWithVideos()}
    </YouTubeFrame>
  );
}

export const English: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="en"
      contentNativeHeight={NATIVE_H}
      before={{
        label: 'Before Movar',
        body: 'A Ukrainian-language YouTube search. With no language hint, recommendations skew to Russian-language channels.',
        urlBar: youtubeUrlBar(),
        content: withoutContent(),
        variant: 'before',
      }}
      after={{
        label: 'After Movar',
        body: 'Same search, same interface. Movar’s language and region hints bring Ukrainian creators to the top.',
        urlBar: youtubeUrlBar(),
        content: withContent(),
        variant: 'after',
      }}
    />
  ),
};

export const Ukrainian: Story = {
  parameters: { browserMock: { uiLanguage: 'uk' } },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="uk"
      contentNativeHeight={NATIVE_H}
      before={{
        label: 'До Movar',
        body: 'Україномовний пошук на YouTube. Без мовної підказки рекомендації схиляються до російськомовних каналів.',
        urlBar: youtubeUrlBar(),
        content: withoutContent(),
        variant: 'before',
      }}
      after={{
        label: 'Після Movar',
        body: 'Той самий пошук, той самий інтерфейс. Підказки мови й регіону від Movar виводять українських авторів нагору.',
        urlBar: youtubeUrlBar(),
        content: withContent(),
        variant: 'after',
      }}
    />
  ),
};
