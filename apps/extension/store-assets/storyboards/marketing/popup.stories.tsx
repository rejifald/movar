import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import type { HiddenSummary } from '../../../src/lib/messaging';
import { useMeasuredHeight } from '../use-measured-height';
import { ukSettings } from '../stories/_seed';

/**
 * Marketing-site `popup.png` thumbnail — the extension popup rendered
 * over a neutral surface at the size declared in the marketing
 * `public/screenshots/README.md`. Used for any future marketing
 * component that wants a tight popup hero (none reference this file
 * yet; the asset is produced ahead of demand so editors can drop it
 * in without spinning the pipeline).
 *
 * Difference vs. `Marketplace/Screenshots/PopupOnNews`: that one
 * composes the popup over a fictitious news article for the store
 * listings at 1280×800. This one is just the popup itself, framed in
 * a light surface so it reads as a UI fragment on a marketing page.
 *
 * Browser-mock state mirrors the Ukrainian marketplace popup story —
 * same `ukSettings`, plus a seeded active tab served in Ukrainian so
 * the hero reads "this page is in Ukrainian" rather than the empty
 * no-page state.
 */
const FRAME_WIDTH = 480;
// Tall enough to clear the popup at the marketing scale below. The popup
// grew when the conceal-mode (curtain/hide) picker landed under the content
// filter; the frame is sized to that natural height rather than cropping it.
const FRAME_HEIGHT = 520;

const meta = {
  title: 'Marketing/Screenshots/Popup',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
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

/** Natural popup width (`App` renders a fixed `w-[360px]` card). */
const POPUP_NATIVE_WIDTH = 360;
/** First-paint estimate, refined by measuring the rendered card. */
const POPUP_NATIVE_HEIGHT = 741;
/** Padding kept around the popup inside the frame. */
const SURFACE_PADDING = 30;
/** Upper bound on the scale so the popup reads as a UI fragment rather than
 *  filling the whole frame — matches the historical 0.62 thumbnail scale. */
const MAX_SCALE = 0.62;

/**
 * Center the real popup on a neutral marketing surface, scaled to fit the
 * frame. `offsetHeight` ignores the `transform: scale()` so measuring the
 * card back is stable; the scale then fits the popup to the frame's height
 * (and width), so if the popup grows the thumbnail shrinks to fit instead of
 * cropping. The capture-script clip guard backstops anything a fixed frame
 * still can't absorb.
 */
function FittedPopupSurface({ children }: Readonly<{ children: ReactNode }>) {
  const [cardRef, popupHeight] = useMeasuredHeight(POPUP_NATIVE_HEIGHT);

  const usableHeight = FRAME_HEIGHT - SURFACE_PADDING * 2;
  const usableWidth = FRAME_WIDTH - SURFACE_PADDING * 2;
  const scale = Math.min(MAX_SCALE, usableHeight / popupHeight, usableWidth / POPUP_NATIVE_WIDTH);

  return (
    <div
      style={{
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        background: '#fafaf9',
        colorScheme: 'light',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: POPUP_NATIVE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          borderRadius: 16,
          background: '#fff',
          boxShadow: '0 18px 56px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const Default: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: { sync: { settings: ukSettings } },
      activeTab: { url: 'https://dnipropost.example/article', hidden: SERVED_UK },
    },
  },
  render: () => (
    <FittedPopupSurface>
      <App />
    </FittedPopupSurface>
  ),
};
