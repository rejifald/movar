import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import type { HiddenSummary } from '../../../src/lib/messaging';
import { ukSettings } from '../stories/_seed';

/**
 * Marketing-site `popup.png` thumbnail — the extension popup rendered
 * over a neutral surface at the small 480×360 size the marketing
 * `public/screenshots/README.md` declares. Used for any future
 * marketing component that wants a tight popup hero (none reference
 * this file yet; the asset is produced ahead of demand so editors
 * can drop it in without spinning the pipeline).
 *
 * Difference vs. `Marketplace/Screenshots/PopupOnNews`: that one
 * composes the popup over a fictitious news article for the store
 * listings at 1280×800. This one is just the popup itself, framed in
 * a 480×360 light surface so it reads as a UI fragment on a marketing
 * page.
 *
 * Browser-mock state mirrors the Ukrainian marketplace popup story —
 * same `ukSettings`, plus a seeded active tab served in Ukrainian so
 * the hero reads "this page is in Ukrainian" rather than the empty
 * no-page state.
 */
const meta = {
  title: 'Marketing/Screenshots/Popup',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    viewport: { width: 480, height: 360 },
    captureOutput: { path: 'popup.png' },
  },
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

const SERVED_UK: HiddenSummary = {
  languages: [],
  containers: 0,
  feedCurtained: 0,
  feedHidden: 0,
  pageLang: 'uk',
  userOverride: false,
};

export const Default: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: { sync: { settings: ukSettings } },
      activeTab: { url: 'https://dnipropost.example/article', hidden: SERVED_UK },
    },
  },
  render: () => (
    <div
      style={{
        width: 480,
        height: 360,
        background: '#fafaf9',
        colorScheme: 'light',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/*
       * Scale-to-fit so the whole popup — status header + hidden
       * panel + pause controls — sits inside the 4:3 marketing frame. The
       * natural popup is ~380×500; at 0.62 it lands at ~236×310,
       * with 25px of breathing room on each side. The wrapping div
       * carries the popup's drop shadow so the scaled child stays
       * visually grounded on the light marketing surface.
       */}
      <div
        style={{
          width: 380,
          transform: 'scale(0.62)',
          transformOrigin: 'center center',
          borderRadius: 16,
          background: '#fff',
          boxShadow: '0 18px 56px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
        }}
      >
        <App />
      </div>
    </div>
  ),
};
