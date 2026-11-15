/**
 * The App Store listing, in order. Headlines are WORKING COPY pending owner
 * sign-off — they live here and nowhere else.
 */
import { fileURLToPath } from 'node:url';
import type { SplitSpec } from './layout.js';
import type { GroundTone } from './palette.js';
import type { SplitTagLabels } from './pieces.js';

export interface ListingShot {
  id: string;
  /** Capture with Movar on (the top part), relative to the captures dir. */
  capture: string;
  /** The same screen with Movar off (the bottom part): `<id>-before.png`. */
  before: string;
  /**
   * `tops` when the page's opening lines differ by language (each part from its
   * own top); `region` when the top is the same in both states, cut through the
   * card Movar conceals.
   */
  split: SplitSpec;
  ground: GroundTone;
  /** Optional background image (path), cover-fit; flat token colour when absent. */
  background?: string;
  headline: { uk: string; en: string };
}

export type Locale = 'uk' | 'en';

/** The seam tags. WORKING COPY pending owner sign-off, like the headlines. */
export const SPLIT_TAGS: Readonly<Record<Locale, SplitTagLabels>> = {
  uk: { after: 'З Моваром', before: 'Без Мовара' },
  en: { after: 'With Movar', before: 'Without Movar' },
};

/** Where `tops` shots put the seam: just under half, so the after page reads first. */
const TOPS_CUT = 0.47;

/** iPhone 6.9" App Store canvas. */
export const APP_STORE_CANVAS = { width: 1320, height: 2868 } as const;

/**
 * The listing's grounds (owner pick, 2026-11-15): concrete with a kalyna sprig,
 * light and dark. AI-generated, upscaled to the canvas; provenance in
 * `assets/grounds/README.md`. A shot's own `background` wins over these.
 */
export const LISTING_GROUNDS: Readonly<Record<GroundTone, string>> = {
  light: fileURLToPath(new URL('../../assets/grounds/concrete-light.jpg', import.meta.url)),
  dark: fileURLToPath(new URL('../../assets/grounds/concrete-dark.jpg', import.meta.url)),
};

export const LISTING: readonly ListingShot[] = [
  {
    id: 'search',
    capture: 'search.png',
    before: 'search-before.png',
    split: { mode: 'tops', cut: TOPS_CUT },
    ground: 'light',
    headline: { uk: 'Пошук — українською', en: 'Search in Ukrainian' },
  },
  {
    id: 'site-no-modal',
    capture: 'site-no-modal.png',
    before: 'site-no-modal-before.png',
    split: { mode: 'tops', cut: TOPS_CUT },
    ground: 'dark',
    headline: {
      uk: 'Сайт — одразу українською, без вікна вибору мови',
      en: 'Sites open in Ukrainian, no language pop-up',
    },
  },
  {
    id: 'site-menu',
    capture: 'site-menu.png',
    before: 'site-menu-before.png',
    split: { mode: 'tops', cut: TOPS_CUT },
    ground: 'light',
    headline: { uk: 'Російську навіть не запропонує', en: "Russian isn't even offered" },
  },
  {
    id: 'youtube',
    capture: 'youtube.png',
    before: 'youtube-before.png',
    // The feed's top is the same either way; the cut runs under the curtain's
    // buttons, so the Russian tile's title shows right below it.
    split: { mode: 'region', cut: 0.705 },
    ground: 'dark',
    headline: { uk: 'YouTube: російські відео сховано', en: 'YouTube: Russian videos hidden' },
  },
];
