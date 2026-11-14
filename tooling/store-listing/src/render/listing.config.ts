/**
 * The App Store listing, in order. Headlines are WORKING COPY pending owner
 * sign-off — they live here and nowhere else.
 */
import { fileURLToPath } from 'node:url';
import type { GroundTone } from './palette.js';

export interface ListingShot {
  id: string;
  /** Capture file name, relative to the captures dir. */
  capture: string;
  ground: GroundTone;
  /** Optional background image (path), cover-fit; flat token colour when absent. */
  background?: string;
  headline: { uk: string; en: string };
}

export type Locale = 'uk' | 'en';

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
    ground: 'light',
    headline: { uk: 'Пошук — українською', en: 'Search in Ukrainian' },
  },
  {
    id: 'site-no-modal',
    capture: 'site-no-modal.png',
    ground: 'dark',
    headline: {
      uk: 'Сайт — одразу українською, без вікна вибору мови',
      en: 'Sites open in Ukrainian, no language pop-up',
    },
  },
  {
    id: 'site-menu',
    capture: 'site-menu.png',
    ground: 'light',
    headline: { uk: 'Російську навіть не запропонує', en: "Russian isn't even offered" },
  },
  {
    id: 'youtube',
    capture: 'youtube.png',
    ground: 'dark',
    headline: { uk: 'YouTube: російські відео сховано', en: 'YouTube: Russian videos hidden' },
  },
];
