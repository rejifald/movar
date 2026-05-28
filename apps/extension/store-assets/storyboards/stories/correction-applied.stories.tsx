import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { App } from '../../../src/entrypoints/popup/App';
import { SiteBackdropRU } from '../backdrops/site-ru';
import { SiteBackdropUK } from '../backdrops/site-uk';
import { EnglishBackdropPlaceholder } from './_placeholder';
import { buildTodayEvents, EVENTS_STORAGE_KEY, ukSettings } from './_seed';

/**
 * Marketplace screenshot #2 — before/after diptych for Movar's correction.
 * Left half is the same fictitious site (*Tochka24*) in its always-bad
 * Russian default (the locked-RU "villain" called out in
 * `store-assets/STORYBOOK-PIPELINE-PLAN.md` §1); right half is the
 * Ukrainian after-state with the Movar popup overlay showing the
 * counter ticking.
 *
 * Layout: each backdrop renders at its native 1280-wide layout inside a
 * 640-wide clipped half via `transform: scale(0.5)`, so a 1280×800
 * Storybook viewport captures both halves at full fidelity. The popup
 * itself is rendered at native size on top of the right half — scaling
 * it would compress the real popup component (the whole point of using
 * the real popup is the pixel-accurate rendering).
 *
 * PR1: Ukrainian only. English is placeholder + `skip-capture`. PR2
 * lands EN backdrops and re-renders this scene end-to-end.
 */
const meta = {
  title: 'Marketplace/Screenshots/CorrectionApplied',
  component: App,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 2,
  },
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

const TODAY_EVENTS_FOR_CORRECTION = buildTodayEvents(47);

const SCENE_FRAME_STYLE: React.CSSProperties = {
  position: 'relative',
  width: 1280,
  height: 800,
  overflow: 'hidden',
};

const HALF_WRAP_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  height: 800,
  width: 640,
  overflow: 'hidden',
};

const SCALED_INNER_STYLE: React.CSSProperties = {
  // The backdrops are designed at 1280×800 native. Halving them via
  // a CSS scale keeps the markup 1:1 with the retired storyboards while
  // fitting both halves into the captured viewport. `1600` height makes
  // sure the `min-height: 100vh` declarations on each backdrop have
  // room to render their bottom sections (the features grid) before
  // overflow clipping kicks in.
  transform: 'scale(0.5)',
  transformOrigin: 'top left',
  width: 1280,
  height: 1600,
};

// Popup offset inside the right (UA) half. The native layout positions
// `.popup-slot` at right:24, bottom:24 — mirror that here so the popup
// sits where the rest of the storyboard family expects it. Width matches
// the popup component's intrinsic 360px.
const POPUP_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: 24,
  bottom: 24,
  width: 360,
  boxShadow: '0 18px 56px rgba(0, 0, 0, 0.22), 0 2px 4px rgba(0, 0, 0, 0.08)',
  borderRadius: 14,
  overflow: 'hidden',
  background: '#fff',
};

// Centre divider — a thin rule between RU and UA halves makes the
// diptych read as a deliberate before/after rather than an accidental
// overlap. 1px is enough on PNG export; anything thicker reads as
// chrome.
const DIVIDER_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 640,
  top: 0,
  bottom: 0,
  width: 1,
  background: 'rgba(15, 23, 42, 0.12)',
};

export const English: Story = {
  tags: ['skip-capture'],
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: {
        sync: { settings: { ...ukSettings, uiLanguage: 'en' } },
        local: { [EVENTS_STORAGE_KEY]: TODAY_EVENTS_FOR_CORRECTION },
      },
    },
  },
  render: () => <EnglishBackdropPlaceholder scene="Correction applied (before / after)" />,
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: {
        sync: { settings: ukSettings },
        local: { [EVENTS_STORAGE_KEY]: TODAY_EVENTS_FOR_CORRECTION },
      },
    },
  },
  render: () => (
    <div style={SCENE_FRAME_STYLE}>
      <div style={{ ...HALF_WRAP_STYLE, left: 0 }}>
        <div style={SCALED_INNER_STYLE}>
          <SiteBackdropRU />
        </div>
      </div>
      <div style={{ ...HALF_WRAP_STYLE, left: 640 }}>
        <div style={SCALED_INNER_STYLE}>
          <SiteBackdropUK />
        </div>
      </div>
      <div style={DIVIDER_STYLE} />
      <div style={POPUP_STYLE}>
        <App />
      </div>
    </div>
  ),
};
