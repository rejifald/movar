/**
 * DOM-level content filtering — the brief's third pillar. Two complementary
 * APIs serve different UX patterns:
 *
 *   filterContentByLanguage(selectors, blocked)
 *     Scan-and-hide for static result cards (Google SERPs). No reveal UI —
 *     the user gets a cleaner page; they can disable Movar for the site if
 *     they need everything back.
 *
 *   applyContentFilter(filter, blocked)
 *     Scan-and-blur with hover-reveal for media grids (YouTube). The user
 *     can peek at a single card without disabling the whole filter.
 *
 * Both rely on @movar/lang-detect for language classification. State is
 * tracked via data attributes so MutationObserver re-passes are cheap.
 */
import type { LanguageCode } from '@movar/shared';
import { detectCyrillicLanguage } from '@movar/lang-detect';
import { attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';
import { getContentMessages } from './i18n/content';

// ─── Hide-based filter (Google SERPs and similar) ────────────────────────

const HIDDEN_ATTR = 'data-movar-hidden';

export interface ContentFilterResult {
  hiddenNodes: HTMLElement[];
}

/** Selectors for Google SERP result cards. The classic `.g` covers the
 *  organic result block on both desktop and mobile; the data-snhf attribute
 *  appears on some news/featured-snippet variants. */
export const GOOGLE_SERP_SELECTORS: readonly string[] = ['div.g', 'div[data-snhf]'];

/** Selectors for YouTube grid items across search/home/sidebar surfaces. */
export const YT_GRID_SELECTORS: readonly string[] = [
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-rich-item-renderer',
  'ytd-compact-video-renderer',
  'ytd-playlist-video-renderer',
];

/**
 * Scan `root` for elements matching any selector, classify their text
 * content, and hide (display:none) any whose language is in `blocked`.
 * Already-hidden nodes are skipped, so this is safe to call repeatedly
 * on DOM mutations.
 */
export function filterContentByLanguage(
  selectors: readonly string[],
  blocked: LanguageCode[],
  root: ParentNode = document,
): ContentFilterResult {
  if (blocked.length === 0 || selectors.length === 0) {
    return { hiddenNodes: [] };
  }
  const blockedSet = new Set(blocked);
  const sel = selectors.join(', ');
  const hiddenNodes: HTMLElement[] = [];

  for (const el of root.querySelectorAll<HTMLElement>(sel)) {
    if (el.hasAttribute(HIDDEN_ATTR)) continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    const det = detectCyrillicLanguage(text);
    // `unknown` is intentional — we'd rather miss a result than hide a
    // non-Russian card on weak evidence. The detector already applies a
    // length-based guard internally.
    if (det.language === 'unknown') continue;
    if (!blockedSet.has(det.language)) continue;

    el.setAttribute(HIDDEN_ATTR, 'content-filter');
    el.style.setProperty('display', 'none', 'important');
    hiddenNodes.push(el);
  }

  return { hiddenNodes };
}

// ─── Shape-based filter (YouTube, social feeds) ──────────────────────────

const CHECKED_ATTR = 'data-movar-content-checked';
const BLURRED_ATTR = 'data-movar-content-blurred';
const REVEALED_ATTR = 'data-movar-revealed';

/**
 * What kind of card a shape matches. Drives curtain copy and per-kind
 * telemetry on {@link CorrectionEvent.subKind} (wired in a later phase).
 *
 *   video         — a single video tile (search results, home grid, sidebar).
 *   channel       — a channel result; the whole card is one link, so blurring
 *                   it adds nothing — better hidden flat.
 *   playlist      — a playlist or mix/radio card.
 *   shorts-shelf  — the Shorts carousel as a unit; child titles are too
 *                   short to classify individually, so the shelf collects
 *                   them and gets hidden as one.
 *   shelf         — generic "Trending in …" type horizontal carousel.
 *   post          — community/backstage post or platform-agnostic feed item.
 */
export type CardKind = 'video' | 'channel' | 'playlist' | 'shorts-shelf' | 'shelf' | 'post';

/**
 * How a matched card is concealed.
 *
 *   blur — overlay a curtain, let the user peek (good for individual videos
 *          where the user might want to confirm a false positive).
 *   hide — `display:none` on the card itself, no curtain UI (good for
 *          channel cards, shelves, and other "the whole card has one
 *          purpose" surfaces where hover-to-reveal adds no value).
 */
export type HideMode = 'blur' | 'hide';

/**
 * One filterable surface on a site. The host's filter is a list of these so
 * channels, videos, shorts shelves, and posts can each declare their own
 * selectors and concealment behaviour without forking the scan loop.
 */
export interface CardShape {
  /** Drives curtain copy and per-kind telemetry. */
  kind: CardKind;
  /** Card-level selector. Comma-list accepted. */
  selector: string;
  /**
   * Sub-selectors whose text contributes to classification. ALL matches
   * inside the card are concatenated — so a shelf that holds many child
   * `#video-title` entries accumulates enough Cyrillic to clear the
   * detector's `MIN_CYRILLIC_FOR_FALLBACK` guard.
   *
   * Uses the `[id="…"]` attribute form rather than `#video-title` because
   * YouTube reuses the same id across many cards (invalid HTML, but real
   * browsers scope querySelector correctly). jsdom's `#id` query
   * optimization is document-scoped and returns null for non-first matches,
   * so the attribute form is the portable shape.
   */
  textSelectors: readonly string[];
  /** Default: `blur`. */
  hideMode?: HideMode;
  /** Skip the shape unless the predicate returns true for the current location. */
  appliesTo?: (loc: Location) => boolean;
  /** Off-by-default shapes (community posts, generic shelves). Gated by
   *  `settings.experimentalShapes` — wired in Phase 6. */
  experimental?: boolean;
}

export interface SiteContentFilter {
  shapes: readonly CardShape[];
}

export interface FilteredCard {
  el: HTMLElement;
  fromLang: LanguageCode;
  kind: CardKind;
}

/** Mobile (`m.youtube.com`) video-tile renderers. The mobile site uses its
 *  own `ytm-*` element prefix; `[id="video-title"]` is shared with desktop,
 *  so the same text selectors classify the same way. */
const YT_MOBILE_VIDEO_SELECTORS: readonly string[] = [
  'ytm-video-with-context-renderer',
  'ytm-compact-video-renderer',
  'ytm-rich-item-renderer',
];

const YOUTUBE_FILTER: SiteContentFilter = {
  shapes: [
    // Standard video tile across SERP, home grid, watch-page sidebar, and
    // inside-playlist surfaces — desktop and mobile both covered. The
    // renderer set covers what users actually see on /results and /watch.
    {
      kind: 'video',
      selector: [...YT_GRID_SELECTORS, ...YT_MOBILE_VIDEO_SELECTORS].join(', '),
      textSelectors: ['[id="video-title"]', 'ytd-channel-name [id="text"]', 'ytd-channel-name a'],
    },
    // Channel result on /results and channel chips in the watch-page sidebar.
    // The whole card is one link to a channel page — blurring + reveal adds
    // nothing here, so we hide flat. Reading both #channel-title and
    // #description lets a short channel name borrow Cyrillic evidence from
    // the longer description.
    //
    // Mobile note: `ytm-channel-renderer` is matched, but its inner DOM uses
    // a different (non-`#channel-title`) structure for the name; full mobile
    // channel coverage needs additional textSelectors and is tracked as a
    // follow-up.
    {
      kind: 'channel',
      selector: 'ytd-channel-renderer, ytd-mini-channel-renderer, ytm-channel-renderer',
      textSelectors: ['#channel-title', '#description'],
      hideMode: 'hide',
    },
    // Playlist, Mix, and Radio results — all card-shaped, all carry the
    // playlist title in #video-title and the creator in ytd-channel-name.
    // Keep `blur` so the user can peek if a quirky-titled UA playlist gets
    // false-positive matched.
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
    // player) — desktop and mobile both covered. Each child Short title is
    // too short to clear the detector's `MIN_CYRILLIC_FOR_FALLBACK = 10`
    // bound on its own, but the shelf collects every child
    // `[id="video-title"]` into one classification input — usually enough to
    // call a predominantly-RU shelf. Hide-mode, because the carousel is the
    // unit; per-item reveal would be busywork.
    //
    // Mixed-language shelves (UA-distinctive + RU-distinctive items in
    // equal measure) fall to `unknown` per detectCyrillicLanguage's tie
    // rule, so they're left alone — see the test in content-filter.test.ts.
    {
      kind: 'shorts-shelf',
      selector: 'ytd-reel-shelf-renderer, ytm-reel-shelf-renderer',
      textSelectors: ['[id="video-title"]'],
      hideMode: 'hide',
    },
  ],
};

const FILTERS: readonly { host: string; filter: SiteContentFilter }[] = [
  { host: 'youtube.com', filter: YOUTUBE_FILTER },
];

export function getFilterForHost(host: string): SiteContentFilter | null {
  for (const { host: m, filter } of FILTERS) {
    if (host === m || host.endsWith(`.${m}`)) return filter;
  }
  return null;
}

/**
 * Concatenate text from every `textSelectors` match inside `card`. Using
 * `querySelectorAll` (rather than the first match only) lets the same shape
 * describe both single-card surfaces (one title) and shelf-like surfaces
 * (many child titles) — the detector treats the joined string as one
 * classification input.
 *
 * Overlapping selectors are handled by dropping any matched element that's
 * already contained inside another matched element. That makes selector
 * authoring forgiving (a fallback-chain pair like `X .name, X a` won't
 * double-count when both happen to match), and keeps shelf-style
 * non-nested matches intact (siblings stay).
 */
function readShapeText(card: HTMLElement, shape: CardShape): string {
  const matched = new Set<Element>();
  for (const sel of shape.textSelectors) {
    for (const el of card.querySelectorAll(sel)) {
      matched.add(el);
    }
  }
  const matchedList = [...matched];
  const parts: string[] = [];
  for (const el of matchedList) {
    // Skip nested-inside-another-match — the ancestor's textContent already
    // includes this element's text.
    if (matchedList.some((other) => other !== el && other.contains(el))) continue;
    const text = (el.textContent ?? '').trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

function attachBlurCurtain(card: HTMLElement, language: LanguageCode): void {
  card.setAttribute(BLURRED_ATTR, language);
  const { content } = getContentMessages();
  attachCurtain(card, {
    mode: 'cover',
    icon: defaultHiddenIcon(),
    title: content.contentHidden.title,
    description: content.contentHidden.descriptionForLanguage(language),
    ariaLabel: content.contentHidden.ariaLabelForLanguage(language),
    actions: [
      {
        label: content.contentHidden.show,
        onClick: (ctx) => {
          ctx.detach();
          card.removeAttribute(BLURRED_ATTR);
          card.setAttribute(REVEALED_ATTR, 'true');
        },
      },
    ],
  });
}

/** `display:none` the card and tag it so `restoreAll` in the content script
 *  picks it up alongside picker hides. The reason string is informational; the
 *  popup's `getHiddenSummary` only counts entries whose reason equals
 *  `not-in-priority`, so content-filter hides don't inflate the picker count. */
function hideCard(card: HTMLElement, kind: CardKind, language: LanguageCode): void {
  card.setAttribute(HIDDEN_ATTR, `content-filter:${kind}:${language}`);
  card.style.setProperty('display', 'none', 'important');
}

// Per-card shape routing: appliesTo guard + signal classification + kind
// dispatch. Each branch corresponds to a distinct card shape; flattening
// would just hide the shape taxonomy.
// fallow-ignore-next-line complexity
function scanShape(shape: CardShape, root: ParentNode): FilteredCard[] {
  if (shape.appliesTo && typeof location !== 'undefined' && !shape.appliesTo(location)) return [];

  const hits: FilteredCard[] = [];
  for (const card of root.querySelectorAll<HTMLElement>(shape.selector)) {
    // Lifecycle gates, ordered most-permanent first: a revealed card stays
    // revealed, a concealed card stays concealed, a scanned-but-not-blocked
    // card doesn't get re-scanned.
    if (card.hasAttribute(REVEALED_ATTR)) continue;
    if (card.hasAttribute(BLURRED_ATTR)) continue;
    if (card.hasAttribute(HIDDEN_ATTR)) continue;
    if (card.hasAttribute(CHECKED_ATTR)) continue;

    const text = readShapeText(card, shape);
    // Lazy-load: card is in DOM but text not yet populated. Skip without
    // marking — the next mutation pass will see it again.
    if (!text) continue;

    card.setAttribute(CHECKED_ATTR, 'true');

    const det = detectCyrillicLanguage(text);
    if (det.language !== 'ru') continue;

    const mode: HideMode = shape.hideMode ?? 'blur';
    if (mode === 'hide') {
      hideCard(card, shape.kind, det.language);
    } else {
      attachBlurCurtain(card, det.language);
    }
    hits.push({ el: card, fromLang: det.language, kind: shape.kind });
  }
  return hits;
}

/**
 * Scan `root` for cards matching each shape and conceal any whose text reads
 * as a blocked language. Idempotent — cards already concealed or revealed
 * are skipped, so the function is safe to call repeatedly on DOM mutations.
 *
 * Returns the cards newly concealed on this call, so the caller can log one
 * correction per card without spamming the dashboard.
 */
export function applyContentFilter(
  filter: SiteContentFilter,
  blocked: readonly LanguageCode[],
  root: ParentNode = document,
): FilteredCard[] {
  // Today only Cyrillic UA-vs-RU is supported; widen this when the detector grows.
  if (!blocked.includes('ru')) return [];

  const hits: FilteredCard[] = [];
  for (const shape of filter.shapes) {
    hits.push(...scanShape(shape, root));
  }
  return hits;
}

/** Clear all blur curtains on the page. Used by the popup's "Show all". */
export function revealAllBlurred(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    card.setAttribute(REVEALED_ATTR, 'true');
    detachAllCurtains(card);
  }
}

/** Strip every bookkeeping mark this module added — BLURRED and CHECKED on
 *  cards, plus their curtains. Used when the user turns content modification
 *  OFF in the popup: the feature is being disabled, not specific cards being
 *  whitelisted, so the next applyContentFilter pass (if it ever comes) must
 *  treat these cards as never-seen-before and re-blur them. Deliberately
 *  leaves REVEALED_ATTR alone — that flag records per-card "Show" clicks
 *  the user made on the curtain itself, and those choices should survive a
 *  toggle off/on cycle. Distinct from revealAllBlurred, which marks every
 *  blurred card REVEALED so subsequent passes leave them alone. */
export function clearAllContentMarks(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    detachAllCurtains(card);
  }
  for (const card of root.querySelectorAll<HTMLElement>(`[${CHECKED_ATTR}]`)) {
    card.removeAttribute(CHECKED_ATTR);
  }
}
