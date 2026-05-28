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

// ─── Blur-based filter (YouTube grids) ───────────────────────────────────

const CHECKED_ATTR = 'data-movar-content-checked';
const BLURRED_ATTR = 'data-movar-content-blurred';
const REVEALED_ATTR = 'data-movar-revealed';

export interface ContentFilter {
  /** Card-level selectors — any matching element is a candidate to blur. */
  cardSelectors: readonly string[];
  /** Selector inside a card that holds the title text. */
  titleSelector: string;
  /** Selector inside a card that holds the channel/author text. */
  channelSelector: string;
}

export interface BlurredCard {
  el: HTMLElement;
  fromLang: LanguageCode;
}

const YOUTUBE_FILTER: ContentFilter = {
  // YouTube ships different card components per page surface: SERP results,
  // home grid, watch-page sidebar, playlists. Covering the renderers that
  // appear on /results and /watch is enough for the user-facing search bug.
  //
  // Selectors use the [id="…"] attribute form rather than `#video-title`
  // because YouTube reuses the same id across many cards (invalid HTML, but
  // real browsers scope querySelector correctly). jsdom's `#id` query
  // optimization is document-scoped and returns null for non-first matches,
  // so the attribute form is the portable shape.
  cardSelectors: YT_GRID_SELECTORS,
  titleSelector: '[id="video-title"]',
  channelSelector: 'ytd-channel-name [id="text"], ytd-channel-name a',
};

const FILTERS: readonly { host: string; filter: ContentFilter }[] = [
  { host: 'youtube.com', filter: YOUTUBE_FILTER },
];

export function getFilterForHost(host: string): ContentFilter | null {
  for (const { host: m, filter } of FILTERS) {
    if (host === m || host.endsWith(`.${m}`)) return filter;
  }
  return null;
}

function readCardText(card: HTMLElement, filter: ContentFilter): string {
  const title = card.querySelector(filter.titleSelector)?.textContent?.trim() ?? '';
  const channel = card.querySelector(filter.channelSelector)?.textContent?.trim() ?? '';
  return `${title} ${channel}`.trim();
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

/**
 * Scan `root` for cards matching the filter and blur any whose title+channel
 * reads as a blocked language. Idempotent — cards already checked, blurred,
 * or revealed are skipped, so it can be called repeatedly on DOM mutations.
 *
 * Returns the cards newly blurred on this call, so the caller can log one
 * correction per card without spamming the dashboard.
 */
export function applyContentFilter(
  filter: ContentFilter,
  blocked: readonly LanguageCode[],
  root: ParentNode = document,
): BlurredCard[] {
  // Today only Cyrillic UA-vs-RU is supported; widen this when the detector grows.
  if (!blocked.includes('ru')) return [];

  const newlyBlurred: BlurredCard[] = [];
  const sel = filter.cardSelectors.join(', ');

  for (const card of root.querySelectorAll<HTMLElement>(sel)) {
    if (card.hasAttribute(REVEALED_ATTR)) continue;
    if (card.hasAttribute(BLURRED_ATTR)) continue;
    if (card.hasAttribute(CHECKED_ATTR)) continue;

    const text = readCardText(card, filter);
    // Lazy-load: card is in DOM but text not yet populated. Skip without
    // marking — the next mutation pass will see it again.
    if (!text) continue;

    card.setAttribute(CHECKED_ATTR, 'true');

    const det = detectCyrillicLanguage(text);
    if (det.language !== 'ru') continue;

    attachBlurCurtain(card, det.language);
    newlyBlurred.push({ el: card, fromLang: det.language });
  }

  return newlyBlurred;
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
