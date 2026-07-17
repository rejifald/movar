/**
 * Movar toolbar / "action" icon — the button that opens the popover.
 *
 * Distinct from {@link BrandMark} and from the popup's inner status hero:
 *
 *   - `BrandMark` is a themeable in-page glyph — its rectangle rides
 *     `currentColor` and its dot rides `var(--accent)`, so it flips with the
 *     surrounding design system.
 *   - This icon is a **self-contained raster asset**. It rasterises to PNG (via
 *     the Sharp pipeline in `apps/extension/scripts/generate-icons.mts`) and is
 *     handed to `browser.action.setIcon`, so it renders with NO CSS context and
 *     ONE PNG has to read on both light and dark browser chrome. That rules out
 *     CSS vars: every colour below is a fixed hex lifted from the design tokens
 *     (`packages/theme/src/tokens.ts`), and the dark stone tile + white "r" stay
 *     constant so the mark keeps its contrast on any toolbar.
 *
 * Only the corner **status indicator** changes per state — the same lever the
 * shipped icon already uses (its green dot). That keeps the family cohesive and
 * legible: at true toolbar size the indicator's *colour* (forest / grey / red)
 * carries the state, and its *shape* reinforces it once the toolbar renders at
 * 2× (≈32px), where the sub-glyphs resolve.
 *
 * Returned as an SVG **string** (not JSX) because that is what every consumer
 * needs: the raster pipeline writes it to a file for Sharp, the e2e visual
 * gallery injects it into a page, and the React {@link ActionIcon} wrapper
 * renders it. One geometry, authored once, so none of those can drift.
 *
 * Exposed via the `./action-icon-svg` sub-path export in
 * `@movar/ui/package.json` (like `./tooltip-position`, and named apart from the
 * React `action-icon.tsx` wrapper) so the raster script and the e2e suite can
 * import it without pulling the React index and its `react-dom` peer.
 */

/* eslint-disable @typescript-eslint/no-magic-numbers -- SVG coordinate
 * geometry: the numbers below are pixel positions/offsets in a fixed 0–128
 * viewBox (the indicator centre ± a few px), i.e. drawing data like icon.svg —
 * not the opaque logic constants the rule is meant to catch. Extracting each
 * offset to a named const would obscure the geometry, not clarify it. */

/* Palette — fixed hex from the design tokens. The system is deliberately one
 * accent (forest) + danger (red) on warm stone, with NO amber, so the inert
 * states lean on stone-grey rather than inventing a warning hue. */
const TILE = '#1c1917'; //   ink-strong — the brand tile, opaque on any chrome
const LETTER = '#ffffff'; // brand-letter — the cutout "r"
const FOREST = '#15803d'; // accent — Movar is acting (on / hiding)
const MUTED = '#a8a29e'; //  stone — inert (paused / off / exempt)
const DANGER = '#b91c1c'; // danger — needs a click (reload / crash)
const RESTING = '#d6d3d1'; // border-strong — the resting ring for the `default_icon` (a tab Movar hasn't resolved yet); a lighter stone than MUTED, and badge-less, so it reads apart from `paused`

/** The six toolbar postures. Each maps to a slice of the popup's own state
 *  model (`StatusHeader`'s `ActivityState` + `HeroState`), collapsed to what a
 *  ~16–32px icon can actually distinguish. */
export type ActionIconState = 'active' | 'blocking' | 'paused' | 'off' | 'exempt' | 'attention';

export interface ActionIconStateMeta {
  key: ActionIconState;
  /** Short label for stories and docs. */
  label: string;
  /** One line: when the toolbar shows this, and what it maps to in the model. */
  summary: string;
}

/** Ordered catalogue — the single list the stories, the visual gallery, and any
 *  future docs iterate over, so adding / renaming / pruning a state is a
 *  one-line edit here rather than a change scattered across surfaces. */
export const ACTION_ICON_STATES: readonly ActionIconStateMeta[] = [
  {
    key: 'active',
    label: 'Active',
    summary: 'On and watching — the page is clean or already in a preferred language.',
  },
  {
    key: 'blocking',
    label: 'Blocking',
    summary:
      'Actively hiding blocked-language content on this tab (the count rides the native badge).',
  },
  {
    key: 'paused',
    label: 'Paused',
    summary: 'Snoozed — paused globally, or snoozed for this site.',
  },
  {
    key: 'off',
    label: 'Off',
    summary: 'Turned off with the master switch.',
  },
  {
    key: 'exempt',
    label: 'Exempt',
    summary: 'This site is on the allowlist — Movar stays out of the way here.',
  },
  {
    key: 'attention',
    label: 'Attention',
    summary: 'Needs a click — reload to start on this tab, or the popup hit an error.',
  },
];

// Status-badge geometry, in the shared 0–128 viewBox. The badge sits in the
// bottom-right — the corner a lowercase "r" leaves empty, which is why the
// shipped icon's accent dot lives there too — but far LARGER than that dot
// (≈42% of the icon) so the state survives shrinking to the toolbar: the disc's
// COLOUR carries the state at 16px, and its white glyph resolves the specific
// state by ~32px. A big filled badge, not a tiny dot, is the whole point.
const BADGE_CX = 92;
const BADGE_CY = 92;
const BADGE_R = 27;

/** Tile-coloured disc punched behind the badge so it reads as a clean overlay
 *  where it grazes the "r" — the fill matches the tile, so it erases the letter
 *  locally rather than adding a visible ring (like a notification badge's
 *  cut-out border). */
function halo(): string {
  return `<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R + 5}" fill="${TILE}"/>`;
}

/** White state glyphs, drawn over the badge disc. Each echoes the popup hero's
 *  lucide icon (`StatusHeader`) so the toolbar and the popup read as one
 *  language. Authored as module consts (computed once from the badge centre)
 *  rather than inline so the state table below stays a flat colour+glyph map. */
const CHECK_GLYPH = `<path d="M80.5 92l7.5 7.5 14-15.5" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const PAUSE_GLYPH =
  `<rect x="${BADGE_CX - 10.5}" y="${BADGE_CY - 12}" width="6.5" height="24" rx="2.5" fill="#fff"/>` +
  `<rect x="${BADGE_CX + 4}" y="${BADGE_CY - 12}" width="6.5" height="24" rx="2.5" fill="#fff"/>`;
// Power (lucide `Power`), scaled so the ring sits just below centre and the stub
// rises from centre — the two balance around the badge centre instead of riding high.
const POWER_GLYPH =
  `<path d="M${BADGE_CX + 7} ${BADGE_CY - 5.9}a9.9 9.9 0 1 1 -14 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>` +
  `<line x1="${BADGE_CX}" y1="${BADGE_CY - 11}" x2="${BADGE_CX}" y2="${BADGE_CY}" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`;
const SLASH_GLYPH =
  `<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="11.5" fill="none" stroke="#fff" stroke-width="5.5"/>` +
  `<line x1="${BADGE_CX - 8}" y1="${BADGE_CY - 8}" x2="${BADGE_CX + 8}" y2="${BADGE_CY + 8}" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/>`;
const EXCL_GLYPH =
  `<rect x="${BADGE_CX - 3}" y="${BADGE_CY - 14}" width="6" height="16" rx="3" fill="#fff"/>` +
  `<circle cx="${BADGE_CX}" cy="${BADGE_CY + 11}" r="3.4" fill="#fff"/>`;

/** The accent colour + badge glyph for each state. One colour drives BOTH the
 *  status ring and the badge, so the two always agree. Colour is the coarse
 *  signal (forest = acting, stone = inert, danger = needs a click); the glyph is
 *  the fine one. `active` has no glyph — a plain forest badge, distinguished from
 *  `blocking` (which adds the check) by the absence of one. */
const STATE_VISUALS: Record<ActionIconState, { color: string; glyph: string }> = {
  active: { color: FOREST, glyph: '' },
  blocking: { color: FOREST, glyph: CHECK_GLYPH },
  paused: { color: MUTED, glyph: PAUSE_GLYPH },
  off: { color: MUTED, glyph: POWER_GLYPH },
  exempt: { color: MUTED, glyph: SLASH_GLYPH },
  attention: { color: DANGER, glyph: EXCL_GLYPH },
};

/** Status ring inset just inside the tile edge (its outer edge aligns with the
 *  tile's). Borrowed from NordVPN's "Secured" emblem: the whole perimeter
 *  carries the state colour, so the state reads at a glance — before the corner
 *  glyph is big enough to resolve. */
function ring(color: string): string {
  return `<rect x="9.5" y="9.5" width="109" height="109" rx="24.5" fill="none" stroke="${color}" stroke-width="7"/>`;
}

/** A filled status disc + optional white glyph, the specific-state signal that
 *  reads once the icon is ≥~32px. The `halo` punches a clean tile-coloured gap
 *  so the badge reads as a node sitting over the ring + "r". */
function badge(fill: string, glyph: string): string {
  return (
    halo() + `<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R}" fill="${fill}"/>` + glyph
  );
}

/** Tile → status ring → cutout "r": the shell shared by every state badge and by
 *  the badge-less {@link defaultActionIconSvg}. The tile + "r" mirror
 *  `apps/extension/src/public/icon.svg` so the mark stays the shipped one; the
 *  ring is the per-state (or resting) overlay. */
function base(ringColor: string): string {
  return (
    `<rect x="6" y="6" width="116" height="116" rx="28" fill="${TILE}"/>` +
    ring(ringColor) +
    `<text x="56" y="100" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="96" fill="${LETTER}" letter-spacing="-0.02em">r</text>`
  );
}

/** The shared shell: {@link base} (tile → ring → "r") → the per-state badge. */
function shell(state: ActionIconState): string {
  const { color, glyph } = STATE_VISUALS[state];
  return base(color) + badge(color, glyph);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ActionIconOptions {
  /** Rendered edge length in px (the viewBox is always 0 0 128 128). */
  size?: number | undefined;
  /** Accessible name. Omit to render the SVG `aria-hidden` (decorative).
   *  `| undefined` (not a bare optional) so callers under
   *  `exactOptionalPropertyTypes` can forward an unset `title` prop directly. */
  title?: string | undefined;
}

/**
 * Full standalone SVG string for one toolbar posture. `xmlns` is included so the
 * output is valid as a standalone file (what Sharp reads) as well as inline
 * (what the React wrapper and the e2e gallery inject).
 */
export function actionIconSvg(
  state: ActionIconState,
  { size = 128, title }: ActionIconOptions = {},
): string {
  const a11y = title === undefined ? 'aria-hidden="true"' : 'role="img"';
  const titleEl = title === undefined ? '' : `<title>${escapeXml(title)}</title>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" ${a11y}>` +
    titleEl +
    shell(state) +
    `</svg>`
  );
}

/**
 * The manifest `default_icon` — the toolbar fallback painted on any tab Movar
 * hasn't resolved a state onto yet: a background tab at the moment you pause, a
 * still-loading or non-web tab, or any tab after the MV3 service worker was
 * evicted and restarted. It wears a neutral resting ring and NO badge (and no
 * accent dot), so an unresolved tab reads as the same tile+ring family as every
 * state instead of a border-less brand mark — the whole reason it exists.
 *
 * Deliberately distinct from `apps/extension/src/public/icon.svg`, the plain
 * brand mark kept for the store pictograms + Safari app icon (which must not
 * grow a status ring). Rasterised beside the states by
 * `apps/extension/scripts/generate-icons.mts`.
 */
export function defaultActionIconSvg({ size = 128, title }: ActionIconOptions = {}): string {
  const a11y = title === undefined ? 'aria-hidden="true"' : 'role="img"';
  const titleEl = title === undefined ? '' : `<title>${escapeXml(title)}</title>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" ${a11y}>` +
    titleEl +
    base(RESTING) +
    `</svg>`
  );
}
