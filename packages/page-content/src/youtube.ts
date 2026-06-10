/**
 * YouTube PageExtractor — lifts YOUTUBE_FILTER.shapes from the old
 * content-filter.ts into the page-content model.
 *
 * Each CardShape becomes a rule: walk `root` for elements matching
 * `shape.selector`, serialize their text via `serializeNodeText`, and emit
 * a ContentNode per card.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/youtube';
 */
import { isYouTubeHost } from '@movar/rules';
import type { CardKind, ContentNode, HideMode, PageContentModel, PageExtractor } from './types';
import { serializeNodeText } from './serialize';
import { registerExtractor } from './registry';

// ─── Selector constants (unchanged from content-filter.ts) ───────────────

/** Desktop YouTube grid-item renderers across search/home/sidebar/watch. */
const YT_GRID_SELECTORS: readonly string[] = [
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-rich-item-renderer',
  'ytd-compact-video-renderer',
  'ytd-playlist-video-renderer',
];

/** Mobile (m.youtube.com) video-tile renderers. */
const YT_MOBILE_VIDEO_SELECTORS: readonly string[] = [
  'ytm-video-with-context-renderer',
  'ytm-compact-video-renderer',
  'ytm-rich-item-renderer',
];

// ─── Shape definitions ────────────────────────────────────────────────────

interface ShapeRule {
  kind: CardKind;
  selector: string;
  textSelectors: readonly string[];
  hideMode?: HideMode;
  appliesTo?: (loc: Location) => boolean;
}

const YT_SHAPES: readonly ShapeRule[] = [
  // Standard video tile across SERP, home grid, watch-page sidebar, and
  // inside-playlist surfaces — desktop and mobile both covered.
  {
    kind: 'video',
    selector: [...YT_GRID_SELECTORS, ...YT_MOBILE_VIDEO_SELECTORS].join(', '),
    textSelectors: ['[id="video-title"]', 'ytd-channel-name [id="text"]', 'ytd-channel-name a'],
  },
  // Channel result on /results and channel chips in the watch-page sidebar.
  // The whole card is one link — blurring + reveal adds nothing, so we hide flat.
  {
    kind: 'channel',
    selector: 'ytd-channel-renderer, ytd-mini-channel-renderer, ytm-channel-renderer',
    textSelectors: ['#channel-title', '#description'],
    hideMode: 'hide',
  },
  // Playlist, Mix, and Radio results.
  {
    kind: 'playlist',
    selector: 'ytd-playlist-renderer, ytd-radio-renderer, ytd-compact-radio-renderer',
    textSelectors: ['[id="video-title"]', 'ytd-channel-name'],
  },
  // Movie purchase/rental cards. Same UX target as a video tile.
  {
    kind: 'video',
    selector: 'ytd-movie-renderer',
    textSelectors: ['[id="video-title"]', 'ytd-channel-name'],
  },
  // Shorts shelves (the carousel on /results, home, and below the watch player)
  // — desktop and mobile. Hide-mode: the carousel is the unit.
  {
    kind: 'shorts-shelf',
    selector: 'ytd-reel-shelf-renderer, ytm-reel-shelf-renderer',
    textSelectors: ['[id="video-title"]'],
    hideMode: 'hide',
  },
];

// ─── Extractor implementation ─────────────────────────────────────────────

function extractYouTube(root: ParentNode): PageContentModel {
  const nodes: ContentNode[] = [];

  for (const shape of YT_SHAPES) {
    if (shape.appliesTo && typeof location !== 'undefined' && !shape.appliesTo(location)) {
      continue;
    }

    for (const el of root.querySelectorAll<HTMLElement>(shape.selector)) {
      const text = serializeNodeText(el, shape.textSelectors);
      nodes.push({
        el,
        kind: shape.kind,
        hideMode: shape.hideMode ?? 'blur',
        text,
      });
    }
  }

  return { extractor: 'youtube', nodes };
}

export const YOUTUBE_EXTRACTOR: PageExtractor = {
  id: 'youtube',
  matches: isYouTubeHost,
  extract: extractYouTube,
};

// Self-register on import so `import './page-content/youtube'` is all a
// caller needs to activate this extractor.
registerExtractor(YOUTUBE_EXTRACTOR);
