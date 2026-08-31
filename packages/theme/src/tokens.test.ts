import { describe, expect, it } from 'vitest';

import {
  renderBreakpointCss,
  renderColorCss,
  renderGlowCss,
  renderMotionCss,
  renderRadiusCss,
  renderShadowCss,
  renderSizeCss,
  renderSpaceCss,
  renderTypeCss,
  renderTypographyCss,
} from './render';
import {
  breakpoints,
  color,
  colorDark,
  colorDarkOverrides,
  colorLight,
  containerBand,
  duration,
  easing,
  fontFamily,
  fontSizeUi,
  forest,
  glow,
  iconSize,
  letterSpacing,
  lineHeight,
  radius,
  shadow,
  shadowDark,
  shadowDarkOverrides,
  size,
  space,
  typeRoles,
  zIndex,
} from './tokens';
import type { ColorToken } from './tokens';

const HEX = /^#[0-9a-f]{6}$/;
const colorNames = Object.keys(colorLight) as ColorToken[];

describe('color tokens', () => {
  it('light and dark expose the same token names', () => {
    expect(Object.keys(colorDark).toSorted()).toEqual([...colorNames].toSorted());
  });

  it('every light and dark value is a 6-digit lowercase hex', () => {
    const bad = colorNames.filter((n) => !HEX.test(colorLight[n]) || !HEX.test(colorDark[n]));
    expect(bad).toEqual([]);
  });

  it('every dark override actually changes its light value (no dead overrides)', () => {
    const light: Record<string, string> = { ...colorLight };
    const dead = Object.entries(colorDarkOverrides)
      .filter(([name, value]) => value === light[name])
      .map(([name]) => name);
    expect(dead).toEqual([]);
  });

  it('the theme-stable tokens are absent from the dark override set', () => {
    // `danger-on` used to be on this list. It is not theme-stable and never
    // was: `danger` flips, so white-on-danger went from 6.47:1 in light to
    // 2.77:1 in dark. An "on" colour inherits its fill's theme behaviour —
    // `accent-on` may stay put only because `accent` does.
    for (const stable of ['accent', 'accent-on'] as const) {
      expect(colorDarkOverrides).not.toHaveProperty(stable);
    }
    expect(colorDarkOverrides).toHaveProperty('danger-on');
  });

  it('the literal colorDark stays in sync with light + overrides (tree-shaking drift guard)', () => {
    // colorDark is spelled out as a literal (not `{...colorLight, ...overrides}`)
    // so it tree-shakes; this guards it never drifts from the derived value.
    expect(colorDark).toEqual({ ...colorLight, ...colorDarkOverrides });
    expect(color.light).toBe(colorLight);
    expect(color.dark).toBe(colorDark);
  });
});

/* -------------------------------------------------------------------------- */
/* Contrast floors                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Text-on-surface contrast, checked at the TOKEN level in both themes.
 *
 * WHY THIS EXISTS, given that a Playwright contrast suite already walks every
 * rendered marketing page. That suite enforces WCAG AA — 4.5:1 — and it was
 * green while the light theme shipped its secondary copy at 4.58:1 and the dark
 * theme shipped the very same token at 7.83:1. Nothing was wrong by the letter
 * of the standard, and nothing could say so: AA is a floor for incidental text,
 * not a target for the colour 542 nodes of body prose are painted in. The
 * reported symptom was "the privacy page is light grey"; the cause was a scale
 * whose muted end had been dialled to the legal minimum and left there.
 *
 * So this guard pins the *intent* the rendered suite cannot see:
 *
 *  - `AA` (4.5:1) — every text token on every surface it is allowed to touch.
 *    The same bar the page suite enforces, but stated per token pair, so a bad
 *    pairing fails before anyone has to render a page to find it.
 *  - `PROSE` (6.5:1) — the ink ramp and `accent-text` on the two surfaces
 *    people actually read paragraphs on (`--bg`, `--surface`). This is the bar
 *    that would have caught the regression, and the one that keeps light and
 *    dark honest with each other: the tightest real value is dark `--ink-soft`
 *    on `--surface` at 6.93:1.
 *
 * It is deliberately tight. Tripping it means a token moved toward the legal
 * minimum, which is a decision someone should have to make on purpose.
 *
 * NOT covered, on purpose:
 *  - `danger` / `danger-deep` are held to AA only. Their hue is fixed by
 *    meaning, they label status rather than carry prose, and they already sit
 *    at 6.2-7.1:1. Prose is not their job.
 *  - `accent` is a FILL. It is checked only against `accent-on`, the colour it
 *    is paired with; as *text* it scores 3.9:1 on dark `--bg`, which is exactly
 *    why `accent-text` exists as a separate, flipping token.
 *  - Dark `--accent-soft` / `--danger-soft` are solid emphasis backgrounds, not
 *    panels: they pair with `*-deep` and `ink-strong`, never with muted ink
 *    (dark `--ink-soft` scores 3.61:1 there). They are listed only for the
 *    tokens that genuinely sit on them.
 */
const AA = 4.5;
const PROSE = 6.5;

/** One 0-255 sRGB channel, linearised — the inner half of the WCAG luminance
 *  formula. At module scope because it does not close over anything. */
const srgbChannel = (raw: number): number => {
  const v = raw / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** Relative luminance, per WCAG 2.x, from a `#rrggbb` string. */
const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgbChannel((n >> 16) & 255) +
    0.7152 * srgbChannel((n >> 8) & 255) +
    0.0722 * srgbChannel(n & 255)
  );
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The two surfaces long-form copy is set on. Everything else is chrome. */
const READING: readonly ColorToken[] = ['bg', 'surface'];
/** Neutral panels, plus the pale/dark tinted panels that carry ordinary copy. */
const PANELS: readonly ColorToken[] = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'accent-surface',
  'danger-surface',
];

/** Every text token, and the surfaces it is allowed to be painted on. */
const TEXT_ON: readonly { text: ColorToken; on: readonly ColorToken[] }[] = [
  { text: 'ink-faint', on: PANELS },
  { text: 'ink-soft', on: PANELS },
  { text: 'ink-medium', on: PANELS },
  { text: 'ink', on: PANELS },
  { text: 'ink-strong', on: [...PANELS, 'accent-soft', 'danger-soft'] },
  { text: 'accent-text', on: PANELS },
  { text: 'accent-deep', on: ['accent-surface', 'accent-soft'] },
  { text: 'danger', on: ['bg', 'surface', 'surface-2', 'danger-surface'] },
  { text: 'danger-deep', on: ['danger-surface', 'danger-soft'] },
  { text: 'accent-on', on: ['accent'] },
  { text: 'danger-on', on: ['danger'] },
];

/** The ramp that carries prose, held to `PROSE` on the reading surfaces. */
const PROSE_TEXT: readonly ColorToken[] = [
  'ink-faint',
  'ink-soft',
  'ink-medium',
  'ink',
  'ink-strong',
  'accent-text',
];

describe('text contrast', () => {
  for (const [theme, palette] of [
    ['light', colorLight],
    ['dark', colorDark],
  ] as const) {
    it(`${theme}: every text token clears AA on every surface it is used on`, () => {
      const failures = TEXT_ON.flatMap(({ text, on }) =>
        on
          .map((surface) => ({ text, surface, ratio: contrast(palette[text], palette[surface]) }))
          .filter((r) => r.ratio < AA)
          .map((r) => `${r.text} on ${r.surface}: ${r.ratio.toFixed(2)}:1 (needs ${AA})`),
      );
      expect(failures).toEqual([]);
    });

    it(`${theme}: the prose ramp clears ${PROSE}:1 on --bg and --surface`, () => {
      const failures = PROSE_TEXT.flatMap((text) =>
        READING.map((surface) => ({
          text,
          surface,
          ratio: contrast(palette[text], palette[surface]),
        }))
          .filter((r) => r.ratio < PROSE)
          .map((r) => `${r.text} on ${r.surface}: ${r.ratio.toFixed(2)}:1 (needs ${PROSE})`),
      );
      expect(failures).toEqual([]);
    });
  }

  it('light and dark read alike — neither theme is the readable one', () => {
    // The regression this file exists for was an asymmetry, not an absolute:
    // light `--ink-soft` sat at 4.58:1 while dark's sat at 7.83:1, so the same
    // semantic token meant "secondary" in one theme and "faded" in the other.
    const drift = PROSE_TEXT.map((text) => ({
      text,
      light: contrast(colorLight[text], colorLight.bg),
      dark: contrast(colorDark[text], colorDark.bg),
    }))
      // `ink-strong`/`accent-text` legitimately diverge — pure-white-on-near-black
      // and a flipped accent both run away from their light twins at the top end.
      // The muted rungs are where parity has to hold.
      .filter((r) => ['ink-faint', 'ink-soft', 'ink-medium'].includes(r.text))
      .filter((r) => Math.max(r.light, r.dark) / Math.min(r.light, r.dark) > 1.35)
      .map((r) => `${r.text}: light ${r.light.toFixed(2)}:1 vs dark ${r.dark.toFixed(2)}:1`);
    expect(drift).toEqual([]);
  });

  it('`accent` is a fill, not text — it is the reason `accent-text` exists', () => {
    // Documents the trap rather than guarding a value: if this ever passes on
    // dark, someone has changed `accent`, and `text-accent-*` call sites need
    // rechecking. See the `accent-text` comment in tokens.ts.
    expect(contrast(colorDark.accent, colorDark.bg)).toBeLessThan(AA);
    expect(contrast(colorDark['accent-text'], colorDark.bg)).toBeGreaterThan(PROSE);
  });
});

describe('other token families', () => {
  it('the forest scale is valid hex', () => {
    expect(Object.values(forest).filter((hex) => !HEX.test(hex))).toEqual([]);
  });

  it('the literal shadowDark stays in sync with light + overrides', () => {
    expect(shadowDark).toEqual({ ...shadow.light, ...shadowDarkOverrides });
    expect(shadow.dark).toBe(shadowDark);
    const light: Record<string, string> = { ...shadow.light };
    const dead = Object.entries(shadowDarkOverrides).filter(([k, value]) => value === light[k]);
    expect(dead).toEqual([]);
  });

  it('scalar families are non-empty strings', () => {
    const bad: string[] = [];
    for (const group of [
      fontFamily,
      fontSizeUi,
      space,
      radius,
      breakpoints,
      letterSpacing,
      lineHeight,
      duration,
      easing,
    ]) {
      for (const [k, v] of Object.entries(group)) {
        if (typeof v !== 'string' || v.length === 0) bad.push(k);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the glow tokens are valid hex (decorative marketing exception)', () => {
    expect(Object.values(glow).filter((hex) => !HEX.test(hex))).toEqual([]);
  });

  it('durations are ms values and the overlay z-index is the 32-bit max', () => {
    expect(Object.values(duration).every((d) => /^\d+ms$/.test(d))).toBe(true);
    expect(zIndex.overlayMax).toBe(2_147_483_647);
  });

  it('the icon ladder is whole-px and strictly ascending', () => {
    const rungs = Object.values(iconSize);
    expect(rungs.every((px) => Number.isInteger(px) && px > 0)).toBe(true);
    expect(rungs.toSorted((a, b) => a - b)).toEqual(rungs);
  });

  it('the icon ladder steps like a ramp, not a continuum', () => {
    // Every step is a real jump (a 12-vs-13 rung pair would be a sub-pixel of
    // stroke apart, i.e. two names for one size) but never so wide it implies a
    // missing rung. Spelled out rather than zipped so a new rung has to be
    // placed here deliberately.
    const ratios = [
      iconSize.sm / iconSize.xs,
      iconSize.md / iconSize.sm,
      iconSize.lg / iconSize.md,
      iconSize.xl / iconSize.lg,
    ];
    expect(ratios.filter((r) => r < 1.1 || r > 1.3)).toEqual([]);
  });

  it('`sm` is the icon ladder’s only off-grid rung (the optical exception)', () => {
    // The rest coincide with Tailwind's 4px scale, so `size-3`/`size-4`/`size-5`
    // /`size-6` are on-ladder too. `sm` (14) has no legal class — `size-3.5` is
    // a banned half-step — which is why prop-sized glyphs drift and this ladder
    // exists. Adding a second off-grid rung means adding a second blind spot.
    const offGrid = Object.entries(iconSize)
      .filter(([, px]) => px % 4 !== 0)
      .map(([rung]) => rung);
    expect(offGrid).toEqual(['sm']);
  });

  it('the container-band ladder doubles, with no rung sneaked in between', () => {
    // The doubling IS the design: container queries are hard boundaries, so
    // adjacent rungs have to be far enough apart that two elements a human
    // reads as the same size can't straddle one. A rung added at, say, 192
    // would reintroduce exactly the near-miss this ladder exists to prevent.
    const rungs = Object.values(containerBand);
    expect(rungs.toSorted((a, b) => a - b)).toEqual(rungs);
    const ratios = rungs.slice(1).map((px, i) => px / rungs[i]!);
    expect(ratios).toEqual(ratios.map(() => 2));
  });

  it('exposes the sizes the styleguide locks', () => {
    expect(size.popup).toBe('360px');
    expect(size.optionsAside).toBe('240px');
    expect(size.contentMax).toBe('600px');
    expect(size.ogCard).toEqual({ width: 1200, height: 630 });
  });
});

describe('per-set CSS renderers', () => {
  it('color.css declares every color on :root, :host, light and dark, + wiring', () => {
    const css = renderColorCss();
    expect(css).toContain(':root, :host {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    const missing = colorNames.filter((n) => !css.includes(`--${n}: ${colorLight[n]};`));
    expect(missing).toEqual([]);
    const missingDark = Object.entries(colorDarkOverrides).filter(
      ([n, v]) => !css.includes(`--${n}: ${v};`),
    );
    expect(missingDark).toEqual([]);
    const unmapped = colorNames.filter((n) => !css.includes(`--color-${n}: var(--${n});`));
    expect(unmapped).toEqual([]);
    expect(css).toContain('--color-forest-700: #15803d;');
  });

  it('typography.css carries the UI scale + type faces + tracking/leading', () => {
    const css = renderTypographyCss();
    expect(css).toContain('--text-ui-base: 13px;');
    expect(css).toContain('--text-ui-base: var(--text-ui-base);');
    expect(css).toContain('--text-ui-lg: 15px;');
    expect(css).toContain('--text-ui-xl: 22px;');
    expect(css).toContain('--tracking-wordmark: -0.045em;');
    expect(css).toContain('--leading-wordmark: 0.86;');
    expect(css).toContain(`--font-mono: ${fontFamily.mono};`);
    // Tracking/leading must be raw `:root` vars (before `@theme`), not
    // @theme-only — otherwise Tailwind tree-shakes them when no utility
    // references them, breaking hand-written `var(--tracking-display)` (the
    // Safari host app). Guards the fix for that regression.
    const rawBlock = css.slice(0, css.indexOf('@theme'));
    expect(rawBlock).toContain('--tracking-display: -0.02em;');
    expect(rawBlock).toContain('--leading-aside: 1.6;');
  });

  it('type.css emits one @utility per role, wired to brand tokens (not raw values)', () => {
    const css = renderTypeCss();
    // One `@utility type-<role>` block per role, no more, no fewer.
    const emitted = [...css.matchAll(/@utility (type-[a-z]+) \{/g)]
      .map((m) => m[1] ?? '')
      .toSorted();
    const expected = Object.keys(typeRoles)
      .map((role) => `type-${role}`)
      .toSorted();
    expect(emitted).toEqual(expected);
    // Roles must reach for the brand tokens via `var()`, never re-hardcode the
    // values the drift replaced (`tracking-tight` -0.025em, `text-sm`). Guards
    // the whole point of the layer.
    expect(css).toContain('@utility type-heading {');
    expect(css).toContain('letter-spacing: var(--tracking-display);');
    expect(css).toContain('font-size: var(--text-ui-xl);');
    expect(css).toContain('letter-spacing: var(--tracking-label);'); // eyebrow
    expect(css).toContain('text-transform: uppercase;'); // eyebrow
    expect(css).toContain('letter-spacing: var(--tracking-wordmark);'); // wordmark
    expect(css).not.toContain('-0.025em'); // no smuggled-back tracking-tight
  });

  it('the two per-surface-sized roles omit font-size; the fixed ones bake it', () => {
    const sizeless = new Set(['display', 'wordmark']);
    for (const [role, decls] of Object.entries(typeRoles)) {
      // Every role names a face — a role with no font-family is a bug, and so is
      // one naming a family that isn't declared (the var would resolve to nothing).
      // Derived from `fontFamily` rather than spelled out: the hardcoded list
      // here is what let `--font-brand` ship unemitted.
      const declared = Object.keys(fontFamily).join('|');
      expect(decls['font-family']).toMatch(new RegExp(String.raw`^var\(--font-(${declared})\)$`));
      const hasSize = 'font-size' in decls;
      expect(hasSize).toBe(!sizeless.has(role));
    }
  });

  it('shadow.css carries the elevation vars + wiring', () => {
    const css = renderShadowCss();
    expect(css).toContain('--shadow-lg:');
    expect(css).toContain('--shadow-lg: var(--shadow-lg);');
  });

  it('motion.css carries the transition durations and no keyframe animation', () => {
    const css = renderMotionCss();
    expect(css).toContain('--duration-fast: 120ms;');
    expect(css).toContain('--duration-base: 150ms;');
    expect(css).toContain('--duration-slow: 200ms;');
    // The applied-pulse keyframes + `--animate-pulse-dot` were removed (they
    // rendered nowhere); guard against silent re-introduction.
    expect(css).not.toContain('@keyframes');
    expect(css).not.toContain('--animate-pulse-dot');
  });

  it('glow.css carries the decorative aurora vars', () => {
    const css = renderGlowCss();
    expect(css).toContain('--glow-primary: #10b981;');
    expect(css).toContain('--glow-secondary: #14b8a6;');
  });

  it('layout sets are separate, opt-in files', () => {
    expect(renderSpaceCss()).toContain('--space-4: 1rem;');
    expect(renderSizeCss()).toContain('--content-max: 600px;');
    expect(renderRadiusCss()).toContain(`--radius-card: ${radius.card};`);
    expect(renderBreakpointCss()).toContain('--breakpoint-md: 768px;');
  });

  it('every raw-variable set is scoped to :root, :host (works in shadow DOM)', () => {
    for (const css of [
      renderColorCss(),
      renderTypographyCss(),
      renderShadowCss(),
      renderMotionCss(),
      renderGlowCss(),
      renderSpaceCss(),
      renderSizeCss(),
    ]) {
      expect(css).toContain(':root, :host {');
    }
  });
});
