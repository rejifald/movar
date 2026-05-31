import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import { NewsBackdropEN } from '../backdrops/news-en';
import { NewsBackdropUK } from '../backdrops/news-uk';
import { buildTodayEvents, EVENTS_STORAGE_KEY, ukSettings } from './_seed';

/**
 * Marketplace screenshot #1 — the Movar popup open over a localised
 * news article. The popup's correction counter shows today's tally
 * (~47 events) and the popup chrome reads in the story's locale.
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

const TODAY_EVENTS_FOR_NEWS = buildTodayEvents(47);

export const English: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: {
        sync: { settings: { ...ukSettings, uiLanguage: 'en' } },
        local: { [EVENTS_STORAGE_KEY]: TODAY_EVENTS_FOR_NEWS },
      },
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
      storage: {
        sync: { settings: ukSettings },
        local: { [EVENTS_STORAGE_KEY]: TODAY_EVENTS_FOR_NEWS },
      },
    },
  },
  render: () => (
    <NewsBackdropUK>
      <App />
    </NewsBackdropUK>
  ),
};
