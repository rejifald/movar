import type { Meta, StoryObj } from '@storybook/react';

import { ChromeTile } from './chrome-tile';

/**
 * Chrome Web Store promo tile — 440×280 single-tile listing graphic.
 * Replaces the inline-SVG + sharp pipeline that lived in
 * `apps/extension/scripts/generate-promo-tile.mts`.
 *
 * Capture conventions the unified script reads from this meta:
 *   - `parameters.viewport` — Playwright viewport to render at; the
 *     tile is composed at 1:1 (no 2× upsampling), browser AA is good
 *     enough at native size.
 *   - `parameters.captureOutput.path` — output relative to
 *     `apps/extension/store-assets/`. CWS English listing only — UK and
 *     other locales reuse the same tile.
 *   - `parameters.screenshotIndex` — sort key inside the storybook
 *     index; arbitrary number, just needs to be unique within Promo.
 *
 * Single story (no English/Ukrainian split): the CWS promo tile is
 * one image per listing. If a UK-localised tile ever needs to ship,
 * add a `Ukrainian` story and a second `captureOutput.path` here.
 */
const meta = {
  title: 'Marketplace/Promo/ChromeTile',
  component: ChromeTile,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    viewport: { width: 440, height: 280 },
    captureOutput: { path: 'chrome/promo-tile-440x280.png' },
  },
} satisfies Meta<typeof ChromeTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
