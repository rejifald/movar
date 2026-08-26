import type { JSX } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CyberpunkLanguagesChart } from './CyberpunkLanguagesChart';
import { SignalLadder } from './SignalLadder';
import { SteamLanguagesChart } from './SteamLanguagesChart';
import { SteamUkrainianTrendChart } from './SteamUkrainianTrendChart';
import { UkrainianMusicChart } from './UkrainianMusicChart';
import { WebLanguagesTrendChart } from './WebLanguagesTrendChart';
import { WikipediaUkraineChart } from './WikipediaUkraineChart';

/**
 * The registry of article scenes, keyed by output filename.
 *
 * An explicit map rather than the Storybook-index scan the old capture script
 * used: the scan meant "whatever stories happen to exist", so a renamed story
 * silently orphaned a committed image, and the set of files an article depends
 * on was not stated anywhere. Here adding a scene is one line, and
 * `article-figures.test.ts` walks this same map to check every committed file
 * still matches a fresh render.
 */
export const SCENES = {
  'cyberpunk-languages': CyberpunkLanguagesChart,
  'signal-ladder': SignalLadder,
  'steam-languages': SteamLanguagesChart,
  'steam-ukrainian-trend': SteamUkrainianTrendChart,
  'ukrainian-music': UkrainianMusicChart,
  'web-languages-trend': WebLanguagesTrendChart,
  'wikipedia-ukraine': WikipediaUkraineChart,
} as const satisfies Record<string, () => JSX.Element>;

function renderScene(name: string): JSX.Element {
  const scene = (SCENES as Record<string, (() => JSX.Element) | undefined>)[name];
  if (scene === undefined) throw new Error(`Unknown article scene: ${name}`);
  return createElement(scene);
}

/**
 * Serialise one scene to the exact bytes committed under
 * `src/content/blog/assets/`.
 *
 * The trailing newline is the only formatting applied: prettifying the markup
 * would add a second thing that has to stay stable for the round-trip check in
 * `article-figures.test.ts` to mean anything.
 */
export function renderSceneToSvg(name: string): string {
  return `${renderToStaticMarkup(renderScene(name))}\n`;
}
