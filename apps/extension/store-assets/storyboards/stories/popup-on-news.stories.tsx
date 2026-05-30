import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import { NewsBackdropEN } from '../backdrops/news-en';
import { NewsBackdropUK } from '../backdrops/news-uk';
import { buildTodayEvents, EVENTS_STORAGE_KEY, ukSettings } from './_seed';

/**
 * Marketplace screenshot #1 — the Movar popup open over a Ukrainian-language
 * news article. The popup's correction counter shows today's tally
 * (~47 events) and the popup chrome reads in the story's locale.
 *
 * PR1 ships the Ukrainian variant only; the English story is wired to a
 * placeholder backdrop and tagged `skip-capture` so
 * `capture-store-screenshots.mts` ignores it. PR2 lands the EN backdrop
 * design and drops the `skip-capture` tag — see
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §6.
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
