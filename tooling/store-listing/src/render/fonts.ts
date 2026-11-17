import { readFileSync } from 'node:fs';
import type { FontWeight } from 'satori';

export const DISPLAY_FAMILY = 'Fixel Display';
const DISPLAY_WEIGHT = 800;

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: 'normal';
}

let cached: SatoriFont[] | undefined;

/** Fonts load only from the local file next to this module — never system fonts. */
export function loadFonts(): SatoriFont[] {
  cached ??= [
    {
      name: DISPLAY_FAMILY,
      data: readFileSync(new URL('fonts/fixel-display-800.otf', import.meta.url)),
      weight: DISPLAY_WEIGHT,
      style: 'normal',
    },
  ];
  return cached;
}
