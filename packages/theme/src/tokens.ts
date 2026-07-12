/**
 * Movar design tokens — the single source of truth for the whole product's
 * visual language, in typed TypeScript.
 *
 * Everything else is *derived* from this file:
 *   - `styles/tokens.css` / `tokens.host.css` / `theme.css` are generated from
 *     these values by `scripts/gen-theme-css.mts` (run `pnpm gen:theme`;
 *     `pnpm check:theme` fails if the committed CSS drifts). Never hand-edit the
 *     generated CSS.
 *   - JS/TS consumers that can't read CSS variables (social-card capture,
 *     `<meta name="theme-color">`, canvas/satori renders) import the constants
 *     here directly, so a hex never has to be copied by hand again.
 *
 * The values mirror `docs/styleguide.md` — the locked Claude Design handoff.
 * That doc is the prose spec ("one accent, forest, on one warm-stone neutral";
 * "do not introduce new colors outside the system"); this file is its
 * machine-readable form. Keep the two in step.
 *
 * Only primitives live here: colors, spacing, font families, radii,
 * breakpoints, sizes, the UI type scale, and shadows — the set the product is
 * *allowed to use*. No components, no logic, no platform side effects.
 */

/* -------------------------------------------------------------------------- */
/* Color                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Semantic color tokens — light theme. The product references these names, not
 * the raw stone/forest steps. Dark values are the overrides in
 * {@link colorDarkOverrides}; anything not overridden is theme-stable.
 */
export const colorLight = {
  /* Stone-warm neutrals */
  bg: '#fafaf9',
  surface: '#ffffff',
  'surface-2': '#f5f5f4',
  'surface-3': '#edeae6',
  border: '#e7e5e4',
  'border-strong': '#d6d3d1',
  'ink-faint': '#737373' /* 5.5:1 on --bg, AA pass */,
  'ink-soft': '#78716c',
  ink: '#44403c',
  'ink-strong': '#1c1917',

  /* Forest accent — the single confident hue; reserved for moments Movar acted
   * on the user's behalf. */
  accent: '#15803d',
  'accent-deep': '#14532d',
  'accent-soft': '#dcfce7',
  'accent-surface': '#f0fdf4',
  'accent-on': '#ffffff',

  /* Danger family — semantic red for invalid form state, destructive
   * affordances, and error surfaces. Hue-mirrors the accent's structure. */
  danger: '#b91c1c',
  'danger-deep': '#7f1d1d',
  'danger-soft': '#fee2e2',
  'danger-surface': '#fef2f2',
  'danger-on': '#ffffff',

  /* Brand-mark letter — flips with the theme so the `r` reads against whatever
   * currentColor the BrandMark tile picks up. */
  'brand-letter': '#ffffff',
} as const;

/** Every semantic color token name. */
export type ColorToken = keyof typeof colorLight;

/**
 * Dark-theme overrides. Only the tokens that actually change between themes are
 * listed — `accent`, `accent-on`, and `danger-on` are intentionally
 * theme-stable (the forest reads correctly on both light and dark chrome). The
 * generator emits exactly these keys into the `prefers-color-scheme: dark`
 * block, so the CSS stays as small as the design intends.
 *
 * Two families role-flip in dark: `--accent-deep`/`--danger-deep` become the
 * *brighter* emphasis text, and the two accent/danger *surfaces* flip from pale
 * pastels to dark tints so panels stop glowing on a near-black background.
 */
export const colorDarkOverrides = {
  bg: '#0c0a09',
  surface: '#1c1917',
  'surface-2': '#292524',
  'surface-3': '#322e2b',
  border: '#2e2a27',
  'border-strong': '#44403c',
  'ink-faint': '#a3a3a3' /* 8.5:1 on --bg, AA pass */,
  'ink-soft': '#a8a29e',
  ink: '#d6d3d1',
  'ink-strong': '#fafaf9',
  'accent-deep': '#86efac' /* light green for text on dark accent surfaces */,
  'accent-soft': '#14532d' /* deep forest tint, used as solid backgrounds */,
  'accent-surface': '#122a1d' /* dark green-tinted panel bg */,
  danger: '#f87171' /* lighter red for borders/text on dark (~5.5:1 on --surface) */,
  'danger-deep': '#fca5a5' /* emphasis text on --danger-surface */,
  'danger-soft': '#7f1d1d' /* deep red, solid backgrounds */,
  'danger-surface': '#2a1414' /* dark red-tinted panel bg */,
  'brand-letter': '#0c0a09' /* reads as a cutout on the light-flipped tile */,
} as const satisfies Partial<Record<ColorToken, string>>;

/**
 * The full Forest scale. `--accent` is step 700; the scale is exposed in full
 * (as `bg-forest-*` utilities) for Tremor charts and edge-case shading. Stone
 * neutrals are left at Tailwind's defaults, which match the design's steps.
 */
export const forest = {
  50: '#f0fdf4',
  100: '#dcfce7',
  200: '#bbf7d0',
  300: '#86efac',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
  800: '#166534',
  900: '#14532d',
} as const;

/** Fully-resolved dark palette (light with the dark overrides applied). A
 *  separate top-level export from {@link colorLight} so a light-only consumer
 *  (e.g. the OG card, which pins to light) tree-shakes the dark values away
 *  instead of bundling them. */
export const colorDark = { ...colorLight, ...colorDarkOverrides } as const;

/** Both themes together, for consumers that genuinely need both. Importing this
 *  bundles light + dark; prefer `colorLight` / `colorDark` when you need one. */
export const color = { light: colorLight, dark: colorDark } as const;

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Font-family stacks (the *names* — the `@fontsource` weight/subset imports
 * that actually load the faces are a per-app bundling decision and stay in each
 * app's CSS). Manrope carries display, body, and UI; IBM Plex Mono carries
 * locale codes, tokens, and meta.
 */
export const fontFamily = {
  sans: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  display: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/**
 * UI type scale — the small, dense set used by `@movar/ui` primitives, in px.
 * Deliberately separate from Tailwind's default `text-*` scale (the `ui-`
 * prefix avoids collision) so neither shadows the other. Generates
 * `text-ui-{micro,xs,sm,base,md}` utilities.
 *
 * (The Safari host app re-declares these in `rem` for iOS Dynamic Type — an
 * app-scoped override, not a change to this default.)
 */
export const fontSizeUi = {
  micro: '10.5px' /* uppercase micro-labels (Pill sm) */,
  xs: '11.5px' /* inline UI text (Select inline) */,
  sm: '12px' /* small body (Pill md, Checkbox description) */,
  base: '13px' /* default UI (Checkbox label, Select form) */,
  md: '14px' /* inline icon glyphs (IconButton) */,
} as const;

/* -------------------------------------------------------------------------- */
/* Layout families — spacing, radius, breakpoints, sizes                      */
/* -------------------------------------------------------------------------- */

/*
 * The four families below are the design ALLOWLIST but are NOT emitted into the
 * shared token CSS. They map 1:1 onto Tailwind's built-in scales (`p-4`,
 * `rounded-lg`, `md:`), so re-emitting them as `:root` custom properties would
 * just force every consumer to bundle vars it never reads — CSS custom
 * properties can't be tree-shaken, so a monolithic token sheet is billed to
 * every importer. They live here as typed constants instead: the enforceable
 * "values we're allowed to use", read atomically by JS that needs raw numbers
 * (Storybook viewports, the OG canvas) or wired into a single app's own CSS on
 * the rare occasion it needs the raw var (e.g. the Safari host's --content-max).
 */

/**
 * Spacing scale — the allowed step ladder, in `rem`, aligned 1:1 with
 * Tailwind's default spacing (`space[4]` === the `p-4` utility === `1rem`).
 */
export const space = {
  0: '0px',
  px: '1px',
  1: '0.25rem' /* 4px */,
  2: '0.5rem' /* 8px */,
  3: '0.75rem' /* 12px */,
  4: '1rem' /* 16px */,
  5: '1.25rem' /* 20px */,
  6: '1.5rem' /* 24px */,
  8: '2rem' /* 32px */,
  10: '2.5rem' /* 40px */,
  12: '3rem' /* 48px */,
  16: '4rem' /* 64px */,
  20: '5rem' /* 80px */,
  24: '6rem' /* 96px */,
} as const;

/* -------------------------------------------------------------------------- */
/* Radius                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Corner radii, by role, aligned to Tailwind's `rounded-*` scale so surfaces use
 * the utilities directly (`chip`=rounded-md, `control`=rounded-lg,
 * `panel`=rounded-xl). No `--radius-*` vars are emitted — they'd collide with
 * Tailwind's. `card` is the bespoke 14px popup/options shell; a surface that
 * wants it uses `rounded-[14px]` (or its own local `--radius-card`).
 */
export const radius = {
  chip: '0.375rem' /* 6px — rounded-md */,
  control: '0.5rem' /* 8px — rounded-lg; buttons, inputs, tabs */,
  panel: '0.75rem' /* 12px — rounded-xl; result cards, insets */,
  card: '0.875rem' /* 14px — the popup / options shell */,
  pill: '9999px' /* fully-rounded pills, toggles, dots */,
} as const;

/* -------------------------------------------------------------------------- */
/* Breakpoints                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Responsive breakpoints — the allowed set. Values match Tailwind's defaults, so
 * surfaces use the `sm:`/`md:` variants directly; these constants just name the
 * same numbers for JS (Storybook viewports, capture scripts). Not emitted to CSS
 * — Tailwind already ships identical `--breakpoint-*`.
 */
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

/* -------------------------------------------------------------------------- */
/* Sizes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Fixed layout sizes — the named component/canvas dimensions the design locks.
 * Consumed from TS (the popup/options shells hard-size in their own CSS, the
 * brand mark and OG card are fixed deliverables, and the Safari host defines its
 * own `--content-max` from this value). Not emitted to the shared CSS.
 */
export const size = {
  /** Popup shell width (styleguide §6.1). */
  popup: '360px',
  /** Options page aside column (styleguide §6.2). */
  optionsAside: '240px',
  /** Max content column — full-bleed on a phone, capped/centered on macOS. */
  contentMax: '600px',
  /** Open Graph share-card canvas (1200×630 social preview). */
  ogCard: { width: 1200, height: 630 },
  /** Brand-mark PNG manifest sizes — must read at 16px on light + dark chrome. */
  brandMark: { sm: 16, md: 32, lg: 48, xl: 128 },
} as const;

/* -------------------------------------------------------------------------- */
/* Shadows                                                                    */
/* -------------------------------------------------------------------------- */

const shadowLight = {
  sm: '0 1px 2px rgba(20, 15, 5, 0.04), 0 1px 1px rgba(20, 15, 5, 0.03)',
  md: '0 6px 24px -10px rgba(20, 15, 5, 0.12), 0 2px 6px rgba(20, 15, 5, 0.04)',
  lg: '0 24px 60px -20px rgba(20, 15, 5, 0.18), 0 6px 18px rgba(20, 15, 5, 0.06)',
} as const;

/** Shadow dark overrides — `sm` is unchanged; `md`/`lg` deepen against the
 *  near-black dark surface. */
const shadowDarkOverrides = {
  md: '0 6px 24px -10px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
  lg: '0 24px 60px -20px rgba(0, 0, 0, 0.7)',
} as const satisfies Partial<Record<keyof typeof shadowLight, string>>;

/** Elevation shadows for both themes. `dark` is fully resolved; the generator
 *  uses the sparse override set. */
export const shadow = {
  light: shadowLight,
  dark: { ...shadowLight, ...shadowDarkOverrides },
} as const;

/** The sparse shadow dark-override set, for the CSS generator. */
export const shadowDark = shadowDarkOverrides;
