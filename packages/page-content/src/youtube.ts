/**
 * YouTube PageExtractor — walks the card renderers of youtube.com and
 * m.youtube.com and emits a ContentNode per filterable card.
 *
 * YouTube is mid-migration from polymer `ytd-…-renderer` / `ytm-…-renderer`
 * custom elements to the "view-model" (wiz) architecture, and BOTH generations
 * are live at
 * once, varying per surface (live survey 2026-08-08, logged-out desktop +
 * mobile-UA):
 *
 *   - /results video results        → still `ytd-video-renderer`
 *   - /results channel results      → still `ytd-channel-renderer`
 *   - "latest from …" shelf videos  → still `ytd-grid-video-renderer`
 *   - Shorts shelf on /results      → `grid-shelf-view-model` holding
 *     `ytm-shorts-lockup-view-model` tiles (`ytd-reel-shelf-renderer` gone);
 *     on the home feed the shelf is `ytd-rich-shelf-renderer[is-shorts]`
 *     whose rich-item cells wrap the same shorts-lockup tiles
 *   - Mix/playlist card on /results → `yt-lockup-view-model`
 *     (`ytd-radio-renderer` gone)
 *   - /watch sidebar recommendations→ `yt-lockup-view-model`
 *     (`ytd-compact-video-renderer` gone)
 *   - home + channel Videos grid    → `ytd-rich-item-renderer` cells whose
 *     body is a `yt-lockup-view-model` (no `[id="video-title"]` inside)
 *   - channel Playlists tab         → standalone `yt-lockup-view-model` cards
 *     with the stacked collection thumbnail
 *   - /playlist video rows          → `yt-lockup-view-model`
 *     (`ytd-playlist-video-renderer` gone from the playlist page)
 *   - m.youtube.com video tiles     → still `ytm-video-with-context-renderer`,
 *     but the tile no longer carries an `[id="video-title"]` anchor — the
 *     title's only durable anchor is its `<h3>`
 *   - channel Posts tab             → still classic `ytd-backstage-post-renderer`
 *     (wrapped by `ytd-backstage-post-thread-renderer`; live @tsn/posts +
 *     @khodorkovskylive/posts 2026-08-09) — post text in
 *     `yt-formatted-string#content-text`, author/time chrome under `#header`
 *
 * Deliberately NOT extracted (product stance, not gaps):
 *   - the /watch queue panel (`ytd-playlist-panel-video-renderer` rows,
 *     still classic markup) — the queue is a list the visitor explicitly
 *     opened; hiding rows there would break playback continuity, not reduce
 *     exposure to unwanted discovery;
 *   - the /shorts player feed (`ytd-reel-video-renderer` + overlay
 *     view-models) — an immersive player, same stance as the /watch player
 *     itself: Movar filters discovery surfaces, not the content the visitor
 *     deliberately opened;
 *   - home-feed ad cells (`ytd-ad-slot-renderer` inside a rich-item) — no
 *     title anchors, so they serialize empty and fail open (kept).
 *
 * Selector discipline (same rules as google.ts): anchor on custom-element TAG
 * NAMES and semantic ids/headings, never on wiz styling classes
 * (`ytLockupViewModelHost`, `shortsLockupViewModelHostMetadataTitle`, …) —
 * readable today, but minifier-adjacent and free to rotate.
 *
 * Sampling discipline (docs/pitfalls.md §1): a card's language sample is its
 * CONTENT text, never its chrome. Classic tiles sample title + channel-name
 * anchors, exactly as before. View-model cards sample their single `<h3>`
 * title ALONE: the lockup's `yt-content-metadata-view-model` byline bakes the
 * channel name together with view-count/date strings («139 тис. · 3 год
 * тому») and the «Нове» badge — UI-language chrome that would pull a short
 * Russian card toward the interface language, the same contamination class as
 * Google's ad location extension. Fail open: a lockup whose h3 rotates away
 * yields empty text and is kept. Community posts follow the same rule: only
 * `#content-text` is sampled — the post `#header` bakes the channel name with
 * the localized relative-time string («1 день тому» / "15 hours ago"), so an
 * image/poll-only post (no `#content-text` text) serializes empty and fails
 * open rather than being decided on its chrome.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/youtube';
 */
import { isYouTubeHost } from '@movar/host-match';
import type { CardKind, ContentNode, HideMode, PageContentModel, PageExtractor } from './types';
import { serializeNodeText } from './serialize';
import { registerExtractor } from './registry';

// ─── Selector constants ───────────────────────────────────────────────────

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

/** New-architecture card: watch-sidebar recommendation, /results Mix/playlist
 *  card, and — on migrated arms — the body of a home/channel grid cell (inside
 *  `ytd-rich-item-renderer`, which the outermost-wins dedup collapses onto). */
const YT_LOCKUP_SELECTOR = 'yt-lockup-view-model';

/** The stacked "collection" thumbnail inside a lockup — renders only on
 *  playlist/Mix cards (a plain video lockup has a flat thumbnail), so it is
 *  the per-element playlist-vs-video discriminator. */
const YT_COLLECTION_THUMB_SELECTOR = 'yt-collection-thumbnail-view-model, yt-collections-stack';

/** Shorts item tile inside the migrated shelf. `ytm-` prefixed but served on
 *  DESKTOP too (verified live) — do not read it as mobile-only. */
const YT_SHORTS_LOCKUP_SELECTOR = 'ytm-shorts-lockup-view-model';

/** Shorts shelves across three generations: the legacy desktop/mobile reel
 *  shelves, the desktop home rich-shelf flagged `is-shorts` (a boolean polymer
 *  attribute, not a styling class), and the migrated `grid-shelf-view-model`.
 *  The last is a GENERIC grid-shelf container — today every observed instance
 *  holds Shorts tiles, but kindOf() re-checks per element and labels a
 *  shorts-less one 'shelf' so curtain copy/telemetry can't lie. */
const YT_SHORTS_SHELF_SELECTOR = [
  'ytd-reel-shelf-renderer',
  'ytm-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'grid-shelf-view-model',
].join(', ');

// ─── Shape definitions ────────────────────────────────────────────────────

interface ShapeRule {
  kind: CardKind;
  selector: string;
  textSelectors: readonly string[];
  /** Sampled only when `textSelectors` matches no text at all — the signature
   *  of a migrated card whose classic anchors are gone. Kept out of the
   *  primary list so classic cards' samples stay byte-identical (a classic
   *  tile's `<h3>` can carry badge chrome next to the title). */
  fallbackTextSelectors?: readonly string[];
  hideMode?: HideMode;
  /** Per-element kind override for shapes whose selector spans card types. */
  kindFor?: (el: HTMLElement) => CardKind;
}

/** Playlist/Mix lockups carry the stacked collection thumbnail; plain video
 *  lockups don't. Shared by the lockup shape and the grid shape (a rich-grid
 *  cell wrapping a Mix lockup is a playlist card too). */
function collectionKind(el: HTMLElement): CardKind {
  return el.querySelector(YT_COLLECTION_THUMB_SELECTOR) === null ? 'video' : 'playlist';
}

const YT_SHAPES: readonly ShapeRule[] = [
  // Standard video tile across SERP, home grid, watch-page sidebar, and
  // inside-playlist surfaces — desktop and mobile both covered. The h3
  // fallback carries the tiles whose classic anchors are gone: mobile
  // ytm-* tiles (no [id="video-title"] anymore) and rich-grid cells whose
  // body is a yt-lockup-view-model.
  {
    kind: 'video',
    selector: [...YT_GRID_SELECTORS, ...YT_MOBILE_VIDEO_SELECTORS].join(', '),
    textSelectors: ['[id="video-title"]', 'ytd-channel-name [id="text"]', 'ytd-channel-name a'],
    fallbackTextSelectors: ['h3'],
    kindFor: collectionKind,
  },
  // Channel result on /results and channel chips in the watch-page sidebar.
  // The whole card is one link — blurring + reveal adds nothing, so we hide flat.
  {
    kind: 'channel',
    selector: 'ytd-channel-renderer, ytd-mini-channel-renderer, ytm-channel-renderer',
    textSelectors: ['#channel-title', '#description'],
    hideMode: 'hide',
  },
  // Classic playlist, Mix, and Radio renderers — legacy arms only; the
  // migrated Mix/playlist card is a yt-lockup-view-model (lockup shape below).
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
  // Shorts shelves (the carousel on /results, home, and below the watch
  // player) — all three generations, desktop and mobile. Hide-mode: the
  // carousel is the unit, and the aggregate of its tile titles is the sample
  // (h3 fallback for shorts-lockup tiles, which carry no [id="video-title"];
  // the shelf's own "YouTube Shorts" header is an h2, so it never enters).
  // Inner tiles that match the grid shape (rich-shelf items) collapse into
  // the shelf node via the outermost-wins dedup in extractYouTube.
  {
    kind: 'shorts-shelf',
    selector: YT_SHORTS_SHELF_SELECTOR,
    textSelectors: ['[id="video-title"]'],
    fallbackTextSelectors: ['h3'],
    hideMode: 'hide',
    kindFor: (el) =>
      el.querySelector(YT_SHORTS_LOCKUP_SELECTOR) !== null || !el.matches('grid-shelf-view-model')
        ? 'shorts-shelf'
        : 'shelf',
  },
  // New-architecture lockup card (watch-sidebar recommendation, /results
  // Mix/playlist card, migrated grid-cell body). Sampled on its single <h3>
  // title ALONE — the yt-content-metadata-view-model byline mixes the channel
  // name with UI-language view-count/date chrome and badges, which would
  // contaminate the sample (docs/pitfalls.md §1). No fallback: fail open.
  {
    kind: 'video',
    selector: YT_LOCKUP_SELECTOR,
    textSelectors: ['h3'],
    kindFor: collectionKind,
  },
  // Community post on the channel Posts tab (still classic markup, live
  // 2026-08-09; ytd-backstage-post-thread-renderer is only the wrapper).
  // Sampled on the post body `#content-text` ALONE — the `#header` bakes the
  // author name with the localized relative-time string («1 день тому» /
  // "15 hours ago"), the same pitfalls §1 chrome class as the lockup byline,
  // and poll-attachment options are UI too. NO fallback: an image/poll-only
  // post serializes empty and fails open (kept). A quoted repost nests another
  // ytd-backstage-post-renderer inside the outer one — the outermost-wins
  // dedup collapses it onto the post the visitor actually sees.
  {
    kind: 'post',
    selector: 'ytd-backstage-post-renderer',
    textSelectors: ['#content-text'],
  },
];

// ─── Extractor implementation ─────────────────────────────────────────────

function extractYouTube(root: ParentNode): PageContentModel {
  const candidates: { el: HTMLElement; shape: ShapeRule }[] = [];
  const seen = new Set<HTMLElement>();
  for (const shape of YT_SHAPES) {
    for (const el of root.querySelectorAll<HTMLElement>(shape.selector)) {
      // Shape selectors are disjoint tag sets today; guard anyway so a future
      // overlap can't double-conceal one element.
      if (seen.has(el)) continue;
      seen.add(el);
      candidates.push({ el, shape });
    }
  }

  // Outermost-wins dedup (mirrors extractGoogle): drop a card nested inside
  // another selected card, so one on-screen unit maps to one node — a
  // yt-lockup-view-model inside its ytd-rich-item-renderer grid cell, or the
  // rich items inside a rich-shelf[is-shorts] carousel, collapse onto the
  // enclosing element, which is the unit the user sees and the one to hide.
  const outermost = candidates.filter(
    ({ el }) => !candidates.some((other) => other.el !== el && other.el.contains(el)),
  );

  const nodes: ContentNode[] = outermost.map(({ el, shape }) => {
    let text = serializeNodeText(el, shape.textSelectors);
    if (text === '' && shape.fallbackTextSelectors !== undefined) {
      text = serializeNodeText(el, shape.fallbackTextSelectors);
    }
    return {
      el,
      kind: shape.kindFor === undefined ? shape.kind : shape.kindFor(el),
      hideMode: shape.hideMode ?? 'blur',
      text,
    };
  });

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
