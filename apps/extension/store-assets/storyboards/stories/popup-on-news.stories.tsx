import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import type { HiddenSummary } from '../../../src/lib/messaging';
import { NewsBackdropEN } from '../backdrops/news-en';
import { NewsBackdropUK } from '../backdrops/news-uk';
import { ukSettings } from './_seed';

/**
 * Marketplace screenshot #1 — the Movar popup open over a localised
 * news article. The popup hero reports the live per-page status —
 * "this page is in <language>" — for the article it's open over, and
 * the chrome reads in the story's locale.
 *
 * Both `English` and `Ukrainian` stories render their real backdrop;
 * `capture-storybook-assets.mts` emits one PNG per locale into
 * `screenshots/{en,uk}/01-popup-on-news.png`. The original PR1/PR2
 * phasing (UK first, EN second) is recorded in
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §6 for history.
 */
const meta = {
  title: 'Marketplace/Screenshots/PopupOnNews',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    /** Capture-script ordering — drives the PNG filename prefix. */
    screenshotIndex: 1,
  },
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The article the popup is open over is served in the user's language, so the
 *  hero reports the all-clear "this page is in <language>". No conceals — the
 *  news backdrop shows a clean localised article, and the popup should reflect
 *  exactly that. */
function servedPage(pageLang: HiddenSummary['pageLang']): HiddenSummary {
  return { languages: [], containers: 0, feedCards: 0, pageLang, userOverride: false };
}

export const English: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: { sync: { settings: { ...ukSettings, uiLanguage: 'en' } } },
      activeTab: { url: 'https://dnipropost.example/article', hidden: servedPage('en') },
    },
  },
  render: () => (
    <NewsBackdropEN>
      <App />
    </NewsBackdropEN>
  ),
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: { sync: { settings: ukSettings } },
      activeTab: { url: 'https://dnipropost.example/article', hidden: servedPage('uk') },
    },
  },
  render: () => (
    <NewsBackdropUK>
      <App />
    </NewsBackdropUK>
  ),
};
