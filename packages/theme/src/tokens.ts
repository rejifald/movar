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

/**
 * Fully-resolved dark palette. Written as an explicit literal, NOT
 * `{ ...colorLight, ...colorDarkOverrides }` — bundlers treat object spread as
 * potentially impure and RETAIN it even when unused, so the spread form would
 * drag the whole dark palette into any consumer that imports only `colorLight`.
 * A plain literal tree-shakes cleanly. `colorDark` mirrors `colorLight` merged
 * with the overrides; the `no dead overrides` + parity tests guard the values.
 */
export const colorDark = {
  bg: '#0c0a09',
  surface: '#1c1917',
  'surface-2': '#292524',
  'surface-3': '#322e2b',
  border: '#2e2a27',
  'border-strong': '#44403c',
  'ink-faint': '#a3a3a3',
  'ink-soft': '#a8a29e',
  ink: '#d6d3d1',
  'ink-strong': '#fafaf9',
  accent: '#15803d',
  'accent-deep': '#86efac',
  'accent-soft': '#14532d',
  'accent-surface': '#122a1d',
  'accent-on': '#ffffff',
  danger: '#f87171',
  'danger-deep': '#fca5a5',
  'danger-soft': '#7f1d1d',
  'danger-surface': '#2a1414',
  'danger-on': '#ffffff',
  'brand-letter': '#0c0a09',
} as const satisfies Record<ColorToken, string>;

/** Both themes together, for consumers that genuinely need both. References
 *  `colorLight`/`colorDark` by identifier (no spread), so it still tree-shakes;
 *  prefer `colorLight` / `colorDark` when you need one. */
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
 * UI type scale — the curated set of UI sizes, in px. Deliberately separate from
 * Tailwind's default `text-*` scale (the `ui-` prefix avoids collision) so
 * neither shadows the other. Generates `text-ui-{micro,2xs,xs,sm,base,md,lg,xl,2xl}`
 * utilities — the whole popup/options UI renders through these. Near-duplicate
 * one-off sizes (10, 11, 12.5px) were consolidated onto the nearest step
 * (≤0.5px shift) so no product surface carries an arbitrary `text-[…]` size.
 *
 * `2xs` (11px) and `2xl` (24px) are the two finer steps the Safari host needs
 * that the compact popup/options don't: the host renders the ENTIRE screen
 * through this scale (it re-declares every step in `rem` for iOS Dynamic Type —
 * an app-scoped override, not a change to these px defaults) and had carried a
 * private `--fs-*` ladder for them; folding them in here retired that parallel
 * scale so there is now one type scale, product-wide.
 */
export const fontSizeUi = {
  micro: '10.5px' /* mono micro-labels, badges (absorbs 10px) */,
  '2xs': '11px' /* host chips / clue labels — a Safari-host step (see note) */,
  xs: '11.5px' /* inline UI + mono code / ord (absorbs 11px) */,
  sm: '12px' /* small body (Pill md, Checkbox description) */,
  base: '13px' /* default UI + detail / aside copy (absorbs 12.5px) */,
  md: '14px' /* inline icon glyphs (IconButton) */,
  lg: '15px' /* applied-row label, section sub-heading (styleguide §6.1) */,
  xl: '22px' /* options / section heading (styleguide §6.2, display 700) */,
  '2xl': '24px' /* host enablement headline — a Safari-host step (see note) */,
} as const;

/**
 * Letter-spacing (tracking) — only the brand-divergent roles the styleguide
 * names (§2.1, §4.1). Keys are brand-named on purpose so the emitted
 * `--tracking-*` / `tracking-*` utilities never shadow Tailwind's built-in
 * `tracking-{tight,normal,wide,wider,widest}` scale (which marketing uses
 * directly). Generic body/UI tracking keeps Tailwind's defaults.
 */
export const letterSpacing = {
  display: '-0.02em' /* display headings + brand letter (§2.1 −2%, §4.1) */,
  wordmark: '-0.045em' /* wordmark lockup (§2.1 −4.5%) */,
  label: '0.1em' /* mono uppercase micro-labels (§6.1); equals Tailwind widest */,
} as const;

/**
 * Line-height — only the brand-divergent roles. Brand-named keys keep the
 * emitted `--leading-*` / `leading-*` utilities clear of Tailwind's built-in
 * `leading-{none,tight,snug,normal,relaxed,loose}` scale. Generic body copy
 * keeps Tailwind's defaults.
 */
export const lineHeight = {
  wordmark: '0.86' /* tight wordmark lockup (§2.1) */,
  aside: '1.6' /* options aside long-form column (§6.2) */,
} as const;

/* -------------------------------------------------------------------------- */
/* Type roles — the semantic layer over the primitives above                  */
/* -------------------------------------------------------------------------- */

/**
 * Semantic typographic roles (styleguide §2.1) — the *one* place a role's full
 * shape (family · size · weight · tracking · leading · transform) is spelled
 * out, so "what a heading is" stops being retyped at every call site. This is
 * the only entry here that composes primitives rather than being one; it earns
 * its place because the composition is exactly the thing that was drifting
 * (headings reaching for Tailwind's `tracking-tight` instead of the brand
 * `--tracking-display`, product copy on `text-sm` instead of `text-ui-*`).
 *
 * Every value is a `var(--…)` reference into the color-free typography sets
 * (`--font-*`, `--text-ui-*`, `--tracking-*`, `--leading-*` from
 * `typography.css`), so a role flips with the theme and can never disagree with
 * the scale. **Color is deliberately NOT a role property** — it stays semantic
 * and explicit at the call site (`text-ink-strong`, `text-accent`, …), which is
 * where it already lived and where it legitimately varies per instance.
 *
 * `render.ts` emits each role as a Tailwind v4 `@utility type-<role>` into
 * `type.css`; `@movar/ui`'s `<Text variant>` is the React wrapper over the same
 * classes, and its variant union is parity-checked against these keys. Sizes are
 * baked in for the fixed product roles; `display` and `wordmark` omit `font-size`
 * because their size is per-surface (the marketing hero is `text-6xl`, the popup
 * brand label ~16px) — the caller adds the size utility.
 *
 * Requires `typography.css` (the `var()` targets) imported alongside `type.css`.
 */
export const typeRoles = {
  /** Mono micro-label / eyebrow — uppercase kicker over a heading (§6.1). */
  eyebrow: {
    'font-family': 'var(--font-mono)',
    'font-size': 'var(--text-ui-micro)',
    'font-weight': '500',
    'letter-spacing': 'var(--tracking-label)',
    'line-height': '1',
    'text-transform': 'uppercase',
  },
  /** Marketing display — hero + section headings; size added by the caller.
   *  No `line-height`: it pairs with a Tailwind size utility (`text-5xl`, …)
   *  that carries its own tuned leading, so baking one here would fight it. */
  display: {
    'font-family': 'var(--font-display)',
    'font-weight': '800',
    'letter-spacing': 'var(--tracking-display)',
  },
  /** Product section heading — 22px display 700 (styleguide §6.2). */
  heading: {
    'font-family': 'var(--font-display)',
    'font-size': 'var(--text-ui-xl)',
    'font-weight': '700',
    'letter-spacing': 'var(--tracking-display)',
    'line-height': '1.2',
  },
  /** Card / feature title — 15px display 700 (styleguide §6.1). */
  title: {
    'font-family': 'var(--font-display)',
    'font-size': 'var(--text-ui-lg)',
    'font-weight': '700',
    'letter-spacing': 'var(--tracking-display)',
    'line-height': '1.3',
  },
  /** UI label — 14px sans 500, row/toggle labels (styleguide §6.2). */
  label: {
    'font-family': 'var(--font-sans)',
    'font-size': 'var(--text-ui-md)',
    'font-weight': '500',
    'letter-spacing': '-0.005em' /* body −0.5% (§2.1) */,
  },
  /** Body / detail copy — 13px sans 400. */
  body: {
    'font-family': 'var(--font-sans)',
    'font-size': 'var(--text-ui-base)',
    'font-weight': '400',
    'line-height': '1.5',
  },
  /** Caption / meta — 11.5px sans 400. */
  caption: {
    'font-family': 'var(--font-sans)',
    'font-size': 'var(--text-ui-xs)',
    'font-weight': '400',
    'line-height': '1.45',
  },
  /** Mono data — locale codes, tokens, ord numbers (11.5px mono 500). */
  mono: {
    'font-family': 'var(--font-mono)',
    'font-size': 'var(--text-ui-xs)',
    'font-weight': '500',
  },
  /** Wordmark lockup — display 800 at wordmark tracking; size per surface. Pair
   *  with a size utility and, for the tall lockup, the `leading-wordmark`
   *  utility (kept off the role so a paired size utility's leading can't clash). */
  wordmark: {
    'font-family': 'var(--font-display)',
    'font-weight': '800',
    'letter-spacing': 'var(--tracking-wordmark)',
  },
} as const;

/** Every semantic type-role name (the `type-*` utility / `<Text variant>` set). */
export type TypeRole = keyof typeof typeRoles;

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
 *  near-black dark surface. The sparse set the CSS generator emits. */
export const shadowDarkOverrides = {
  md: '0 6px 24px -10px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
  lg: '0 24px 60px -20px rgba(0, 0, 0, 0.7)',
} as const satisfies Partial<Record<keyof typeof shadowLight, string>>;

/** Fully-resolved dark shadows as a plain literal — NOT
 *  `{ ...shadowLight, ...shadowDarkOverrides }` (spread would defeat
 *  tree-shaking; see {@link colorDark}). `sm` matches light; `md`/`lg` deepen. */
export const shadowDark = {
  sm: '0 1px 2px rgba(20, 15, 5, 0.04), 0 1px 1px rgba(20, 15, 5, 0.03)',
  md: '0 6px 24px -10px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)',
  lg: '0 24px 60px -20px rgba(0, 0, 0, 0.7)',
} as const satisfies Record<keyof typeof shadowLight, string>;

/** Elevation shadows for both themes. Identifier refs only (no spread), so an
 *  unused `shadow` still tree-shakes. */
export const shadow = { light: shadowLight, dark: shadowDark } as const;

/* -------------------------------------------------------------------------- */
/* Motion                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Transition durations. Movar is mostly static (styleguide §7: "everything else
 * snaps"); this is the small blessed set. Emitted as raw `--duration-*` vars so
 * hand-written CSS uses `var(--duration-base)` and Tailwind consumers use
 * `duration-[var(--duration-base)]`. Content scripts that inject CSS into host
 * pages (no Movar `:root`) import these constants and interpolate the literal.
 */
export const duration = {
  fast: '120ms' /* color / background hovers */,
  base: '150ms' /* tooltips, standard UI transitions */,
  slow: '200ms' /* toggles (styleguide §7, `.2s`) */,
} as const;

/**
 * Timing functions. Typed constants only — deliberately NOT emitted to CSS:
 * Tailwind's `--ease-*` are cubic-bezier curves, and re-declaring `--ease-out`
 * as the bare keyword would clobber them. Hand-written CSS / Tailwind use their
 * own `ease-*`; content scripts interpolate these literals.
 */
export const easing = {
  standard: 'ease',
  out: 'ease-out' /* reveals, tooltips, the applied pulse */,
} as const;

/* -------------------------------------------------------------------------- */
/* Glow — decorative marketing aurora                                         */
/* -------------------------------------------------------------------------- */

/**
 * The hero aurora glows. A deliberate, documented exception to "one accent"
 * (styleguide §1/§9): emerald + teal, used only for the ambient hero wash on the
 * marketing site, never on product chrome. Tokenised so they stop being loose
 * hexes; emitted as raw `--glow-*` vars that marketing references via `var()`.
 */
export const glow = {
  primary: '#10b981' /* emerald — aurora 1 + top glow */,
  secondary: '#14b8a6' /* teal — aurora 2 */,
} as const;

/* -------------------------------------------------------------------------- */
/* Z-index                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Stacking ceiling for overlays injected into arbitrary host pages (the curtain,
 * the diagnostics FAB) that must sit above any page chrome. A typed constant,
 * not a CSS var — the consumers set it via inline styles / JS.
 */
export const zIndex = {
  overlayMax: 2147483647 /* max signed 32-bit int */,
} as const;
