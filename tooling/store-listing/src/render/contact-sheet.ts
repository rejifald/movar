import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { createElement as h } from 'react';
import { DISPLAY_FAMILY, loadFonts } from './fonts.js';
import { dataUri } from './pieces.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- contact-sheet layout. */

export interface SheetItem {
  label: string;
  png: Uint8Array;
}

const TILE_WIDTH = 330;
/** Landscape sheets: wider tiles, two to a row, so a window stays readable. */
const GRID_TILE_WIDTH = 620;
const GAP = 24;
const LABEL_HEIGHT = 44;

/** All shots side by side, downscaled and labelled. Dev artefact, deterministic. */
export async function contactSheet(items: readonly SheetItem[], columns?: number): Promise<Buffer> {
  if (columns !== undefined) return gridSheet(items, columns);
  const tiles = await Promise.all(
    items.map(async (item) => {
      const scaled = await sharp(item.png).resize({ width: TILE_WIDTH }).png().toBuffer();
      const { height } = await sharp(scaled).metadata();
      return { label: item.label, uri: dataUri('image/png', scaled), height: height };
    }),
  );
  const tileHeight = Math.max(...tiles.map((tile) => tile.height));
  const width = GAP + tiles.length * (TILE_WIDTH + GAP);
  const height = GAP + LABEL_HEIGHT + tileHeight + GAP;
  const svg = await satori(
    h(
      'div',
      {
        style: {
          display: 'flex',
          width,
          height,
          paddingTop: GAP,
          paddingLeft: GAP,
          backgroundColor: '#8a8681',
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 800,
          fontSize: 26,
          color: '#ffffff',
        },
      },
      ...tiles.map((tile) =>
        h(
          'div',
          {
            key: tile.label,
            style: { display: 'flex', flexDirection: 'column', marginRight: GAP },
          },
          h('div', { style: { display: 'flex', height: LABEL_HEIGHT } }, tile.label),
          h('img', { src: tile.uri, width: TILE_WIDTH, height: tile.height }),
        ),
      ),
    ),
    { width, height, fonts: loadFonts() },
  );
  return Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}

/** Landscape variant: tiles wrapped into rows of `columns`. */
async function gridSheet(items: readonly SheetItem[], columns: number): Promise<Buffer> {
  const tiles = await Promise.all(
    items.map(async (item) => {
      const scaled = await sharp(item.png).resize({ width: GRID_TILE_WIDTH }).png().toBuffer();
      const { height } = await sharp(scaled).metadata();
      return { label: item.label, uri: dataUri('image/png', scaled), height };
    }),
  );
  const tileHeight = Math.max(...tiles.map((tile) => tile.height));
  const rows = Math.ceil(tiles.length / columns);
  const width = GAP + columns * (GRID_TILE_WIDTH + GAP);
  const height = GAP + rows * (LABEL_HEIGHT + tileHeight + GAP);
  const svg = await satori(
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          width,
          height,
          paddingTop: GAP,
          paddingLeft: GAP,
          backgroundColor: '#8a8681',
          fontFamily: DISPLAY_FAMILY,
          fontWeight: 800,
          fontSize: 26,
          color: '#ffffff',
        },
      },
      ...tiles.map((tile) =>
        h(
          'div',
          {
            key: tile.label,
            style: {
              display: 'flex',
              flexDirection: 'column',
              marginRight: GAP,
              marginBottom: GAP,
            },
          },
          h('div', { style: { display: 'flex', height: LABEL_HEIGHT } }, tile.label),
          h('img', { src: tile.uri, width: GRID_TILE_WIDTH, height: tile.height }),
        ),
      ),
    ),
    { width, height, fonts: loadFonts() },
  );
  return Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}
