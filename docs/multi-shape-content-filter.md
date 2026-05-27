# Multi-Shape Content Filter

**Status:** in progress · **Owner:** content-filter · **Tracking:** this doc
**Related code:** [apps/extension/src/lib/content-filter.ts](../apps/extension/src/lib/content-filter.ts), [apps/extension/src/entrypoints/content.ts](../apps/extension/src/entrypoints/content.ts), [packages/shared/src/index.ts](../packages/shared/src/index.ts)

## Context

Today's content filter on YouTube only matches **video tiles** — `ytd-video-renderer`, `ytd-grid-video-renderer`, `ytd-rich-item-renderer`, `ytd-compact-video-renderer`, `ytd-playlist-video-renderer`. The `ContentFilter` shape in [content-filter.ts:87](../apps/extension/src/lib/content-filter.ts) bakes in two sub-selectors — `titleSelector` and `channelSelector` — that describe a video card and nothing else.

This shape silently misses:

| Surface                                                         | Element                                                     | Status                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Shorts shelf (carousel on `/results`, home, below watch player) | `ytd-reel-shelf-renderer`                                   | untouched                                                   |
| Shorts grid (`/shorts`)                                         | `ytm-shorts-lockup-view-model-v2`, `ytd-reel-item-renderer` | untouched                                                   |
| Channel result card                                             | `ytd-channel-renderer`, `ytd-mini-channel-renderer`         | untouched (no `#video-title`, `readCardText` returns empty) |
| Mix / Radio                                                     | `ytd-radio-renderer`, `ytd-compact-radio-renderer`          | untouched                                                   |
| Movie result                                                    | `ytd-movie-renderer`                                        | untouched                                                   |
| Hashtag tile                                                    | `ytd-hashtag-tile-renderer`                                 | untouched                                                   |
| Community / Backstage post                                      | `ytd-backstage-post-thread-renderer`                        | untouched                                                   |
| Mobile DOM (`m.youtube.com`)                                    | `ytm-*` variants                                            | untouched (host matches, selectors don't)                   |
| Playlist result                                                 | `ytd-playlist-renderer`                                     | accidentally matched as video, wrong curtain copy           |

Two missing types the user explicitly named — shorts and channels — sit at opposite ends of the same architectural gap. Channel cards have _no_ title-plus-channel split (the channel name _is_ the title). Shorts shelves are a _unit_ (the whole carousel), not a card with a single title. The current shape can't express either.

## Design

### Types — replace the one-shape struct with a shape list

```ts
export type CardKind =
  | 'video' // standard video tile
  | 'channel' // channel card / mini channel
  | 'playlist' // playlist or mix card
  | 'shorts-shelf' // the carousel as a unit
  | 'shelf' // generic carousel ("Trending in …")
  | 'post'; // community / forum post

export type HideMode =
  | 'blur' // overlay curtain, hover-peek (current default)
  | 'hide'; // display:none on the card, no curtain UI

export interface CardShape {
  /** Drives curtain copy and the dashboard breakdown. */
  kind: CardKind;
  /** Card-level selector — comma-list accepted. */
  selector: string;
  /**
   * Sub-selectors whose text contributes to classification. ALL matches under
   * the card are concatenated — so a shorts shelf can collect every child
   * `#video-title` to clear the detector's `MIN_CYRILLIC_FOR_FALLBACK` guard.
   */
  textSelectors: readonly string[];
  /** Default: 'blur'. Use 'hide' for channel cards and shelves. */
  hideMode?: HideMode;
  /** Gate by URL path or other location-derived signal. */
  appliesTo?: (loc: Location) => boolean;
  /** Marks experimental shapes — gated by `settings.experimentalShapes`. */
  experimental?: boolean;
}

export interface SiteContentFilter {
  shapes: readonly CardShape[];
}
```

### YouTube config under the new shape

```ts
const YOUTUBE_FILTER: SiteContentFilter = {
  shapes: [
    {
      kind: 'video',
      selector: [
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-rich-item-renderer',
        'ytd-compact-video-renderer',
        'ytd-playlist-video-renderer',
        // Mobile:
        'ytm-video-with-context-renderer',
        'ytm-compact-autoplay-renderer',
        'ytm-rich-item-renderer',
      ].join(', '),
      textSelectors: ['[id="video-title"]', 'ytd-channel-name'],
    },
    {
      kind: 'channel',
      selector: 'ytd-channel-renderer, ytd-mini-channel-renderer, ytm-channel-renderer',
      textSelectors: ['#channel-title', '#text-container', '#description'],
      hideMode: 'hide',
    },
    {
      kind: 'playlist',
      selector: 'ytd-playlist-renderer, ytd-radio-renderer, ytd-compact-radio-renderer',
      textSelectors: ['[id="video-title"]', 'ytd-channel-name', '#byline'],
    },
    {
      kind: 'video',
      selector: 'ytd-movie-renderer',
      textSelectors: ['[id="video-title"]', 'ytd-channel-name'],
    },
    {
      kind: 'shorts-shelf',
      selector: 'ytd-reel-shelf-renderer, ytm-reel-shelf-renderer',
      textSelectors: ['#video-title', '.reel-item-endpoint'],
      hideMode: 'hide',
    },
    {
      kind: 'video',
      selector: 'ytd-hashtag-tile-renderer',
      textSelectors: ['#hashtag-title', '#hashtag'],
      hideMode: 'hide',
    },
    // Experimental — gated by settings.experimentalShapes
    {
      kind: 'post',
      selector: 'ytd-backstage-post-thread-renderer',
      textSelectors: ['#content-text', '#author-text'],
      appliesTo: (l) => /\/(community|post)/.test(l.pathname),
      experimental: true,
    },
  ],
};
```

### Key design choices

- **Shorts shelves use `hide`, not blur.** Individual Short titles are too short to clear the detector's `MIN_CYRILLIC_FOR_FALLBACK = 10` bound. Collecting every child `#video-title` into one classification accumulates enough evidence and matches the user's mental model — "I don't want a Shorts carousel of Russian content," not "selectively peek inside it."
- **Channels and hashtag tiles use `hide`.** A channel card's whole purpose is the link to the channel; blurring + reveal adds nothing. Same for hashtag tiles.
- **Playlists keep `blur`** — false-positive risk is real on creator playlists with quirky titles.
- **Mobile selectors live alongside desktop ones** in the same shape. `getFilterForHost('m.youtube.com')` already returns the YouTube filter via suffix match; we only needed the selectors.
- **`textSelectors` use `querySelectorAll`**, so a single-match card and a multi-match shelf both work with the same shape definition.

### Other platforms — same shape, no code change

Adding TikTok / Twitter / Reddit becomes a config change:

```ts
const TWITTER_FILTER: SiteContentFilter = {
  shapes: [
    {
      kind: 'post',
      selector: 'article[data-testid="tweet"]',
      textSelectors: ['[data-testid="tweetText"]', '[data-testid="User-Name"]'],
      experimental: true,
    },
  ],
};

const TIKTOK_FILTER: SiteContentFilter = {
  shapes: [
    {
      kind: 'video',
      selector: '[data-e2e="recommend-list-item-container"]',
      textSelectors: ['[data-e2e="video-desc"]', '[data-e2e="user-title"]'],
      experimental: true,
    },
  ],
};
```

## Phases

### Phase 1 — Refactor (no behaviour change)

**Goal:** rename `ContentFilter` to `SiteContentFilter`, port the existing video shape to the new list-of-shapes form, dispatch hide-mode through the new path. All existing tests pass.

**Files**

- `apps/extension/src/lib/content-filter.ts` — types + `applyContentFilter` rewrite
- `apps/extension/src/lib/content-filter.test.ts` — adjust fixtures only

**Tests**

- All existing tests pass.
- New unit test: `hideMode: 'hide'` path sets `display:none` + `HIDDEN_ATTR`, no curtain attached.
- New unit test: a `SiteContentFilter` with two shapes scans both selector sets in one call.

### Phase 2 — Channel, playlist/mix, movie, hashtag

**Goal:** cover surfaces the current filter silently misses (excluding shorts shelves).

**Shape additions:** `channel`, `playlist` (incl. radio/mix), `movie`, `hashtag tile` (see config above).

**Tests:** one positive + one Ukrainian-negative + one idempotency per shape.

### Phase 3 — Shorts shelves

**Goal:** collapse Russian Shorts carousels as a unit.

**Risk:** mixed-language shelves. Detector returns `unknown` when UA and RU signals are present — verify a 3-RU + 2-UA shelf is left alone.

### Phase 4 — Mobile selectors (`ytm-*`)

**Goal:** plug the silent miss on `m.youtube.com`.

**Mechanical:** merge `ytm-*` selectors into the existing shape selector strings.

### Phase 5 — Per-kind curtain copy + dashboard sub-kind

**Goal:** curtains read "Russian channel hidden" / "Russian Shorts hidden" instead of pretending everything's a video. Dashboard can break down by kind.

**Files**

- `packages/shared/src/index.ts` — add `subKind?: CardKind` to `CorrectionEvent`
- `apps/extension/src/lib/i18n/messages-en.ts` + `messages-uk.ts` — `titleForKind`, kind-aware `descriptionForLanguage`/`ariaLabelForLanguage`
- `apps/extension/src/lib/content-filter.ts` — pass `kind` to curtain
- `apps/extension/src/entrypoints/content.ts` — emit `subKind` on `logCorrection`

**Tests:** per-kind curtain copy verified in EN + UK; `CorrectionEvent.subKind` populated; backward-compat for events without `subKind`.

### Phase 6 — Experimental shapes behind a flag

**Goal:** ship higher-FP-risk shapes (community posts, generic shelves) off by default.

**Files**

- `packages/shared/src/index.ts` — `MovarSettings.experimentalShapes: boolean` (default `false`)
- `apps/extension/src/lib/content-filter.ts` — `applyContentFilter` skips experimental shapes when off
- `apps/extension/src/entrypoints/content.ts` — pass the flag through
- `apps/extension/src/entrypoints/options/PageContentSection.tsx` — toggle UI

### Phase 7 — Non-YouTube platforms (follow-up PR)

TikTok, Twitter/X, Reddit — one shape config each, gated by `experimentalShapes`, one positive + one negative test each. Carved out so this work can ship without waiting on harder surfaces.

## Out of scope

- Comment filtering (high volume, low value).
- Ads / promoted slots (ad-blockers exist).
- Per-Short tile classification inside a shelf (shelf-level hide is the right level of granularity given detector confidence).
- Dashboard UI changes for `subKind` (the event extension lands in this work; dashboard rendering follows).

## Open questions

1. **Delete `filterContentByLanguage`** + `GOOGLE_SERP_SELECTORS`? It's exported, has tests, but never called from `content.ts`. The new shape-list with `hideMode: 'hide'` covers its use case. **Decision (Phase 1):** leave it in place for now, mark as a follow-up cleanup. Removing it isn't blocking.
2. **Mixed-language shelf detector behaviour.** Confirmed by inspection: `detectCyrillicLanguage` returns `unknown` when both `ы/ё` and `і/ї/є/ґ` are present in equal measure ([lang-detect/src/index.ts:64](../packages/lang-detect/src/index.ts:64)). Phase 3 test must verify.
3. **`CorrectionEvent` backward compat.** `subKind` is optional. If the dashboard or any external consumer doesn't tolerate missing values, that's the dashboard's bug. Confirm no schema-validation layer is rejecting unknown keys before shipping Phase 5.

## Rollout

- Phases 1–4 in a single PR — together they're the user-facing win.
- Phase 5 separately (touches shared types + i18n).
- Phase 6 separately, gated.
- Phase 7 follow-up.
