import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { SiteBackdropEN } from '../backdrops/site-en';
import { SiteBackdropRU } from '../backdrops/site-ru';
import { SiteBackdropUK } from '../backdrops/site-uk';

/**
 * Marketplace screenshot #2 — before/after for Movar's site-language
 * correction. The diptych contrasts the same fictitious site
 * (*Tochka24*) in its always-bad Russian default against the
 * after-state Movar negotiated in the user's locale (UK or EN).
 *
 * The Movar popup is intentionally *not* composited over either half:
 * the message is the language flip on the site itself, and a hovering
 * popup would compete with the captions for the viewer's attention.
 * `popup-on-news` (scene #1) is the dedicated showcase for the popup
 * UI; this scene is the dedicated showcase for what the user sees on
 * the page they were trying to read.
 *
 * Each story renders the diptych via `BeforeAfterFrameWithFrame`; the
 * locale governs only which UA-or-EN content the After half hosts and
 * which language the captions are written in. The RU before-half is
 * shared because the locked-RU default is, definitionally, the same
 * across locales.
 *
 * Captures land at `screenshots/{en,uk}/02-correction-applied.png`.
 */
const meta = {
  title: 'Marketplace/Screenshots/CorrectionApplied',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 2,
  },
  // Meta-level placeholder args. Each story passes its real props via
  // `render`, so these never reach the screen — they exist to satisfy
  // CSF strict typing on a meta whose `component` has required props.
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'en',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * tochka24's URL stays identical across both halves — Movar's site-
 * language correction negotiates via Accept-Language, not URL params,
 * so the only thing that changes between Before and After is the
 * page content. The URL bar still renders so the half reads as a
 * browser surface (matching the search-rewrite scene's chrome).
 */
const TOCHKA_URL = 'tochka24.example';

export const English: Story = {
  parameters: {
    browserMock: { uiLanguage: 'en-US' },
  },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="en"
      contentNativeHeight={960}
      before={{
        label: 'Without Movar',
        body: 'The site loads in its Russian default — same URL, same brand, no language switch surfaced to the user.',
        urlBar: TOCHKA_URL,
        content: <SiteBackdropRU />,
        variant: 'before',
      }}
      after={{
        label: 'With Movar',
        body: 'Movar negotiates language with the site on every request. Same domain — your preferred language instead.',
        urlBar: TOCHKA_URL,
        content: <SiteBackdropEN />,
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
      contentNativeHeight={960}
      before={{
        label: 'Без Movar',
        body: 'Сайт відкривається російською — той самий домен, той самий бренд, без видимого перемикача мов.',
        urlBar: TOCHKA_URL,
        content: <SiteBackdropRU />,
        variant: 'before',
      }}
      after={{
        label: 'З Movar',
        body: 'Movar домовляється про мову на кожному запиті. Той самий домен — українська замість російської.',
        urlBar: TOCHKA_URL,
        content: <SiteBackdropUK />,
        variant: 'after',
      }}
    />
  ),
};
