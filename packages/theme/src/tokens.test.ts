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
    for (const stable of ['accent', 'accent-on', 'danger-on'] as const) {
      expect(colorDarkOverrides).not.toHaveProperty(stable);
    }
  });

  it('the literal colorDark stays in sync with light + overrides (tree-shaking drift guard)', () => {
    // colorDark is spelled out as a literal (not `{...colorLight, ...overrides}`)
    // so it tree-shakes; this guards it never drifts from the derived value.
    expect(colorDark).toEqual({ ...colorLight, ...colorDarkOverrides });
    expect(color.light).toBe(colorLight);
    expect(color.dark).toBe(colorDark);
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
      // Every role names a face — a role with no font-family is a bug.
      expect(decls['font-family']).toMatch(/^var\(--font-(sans|display|mono)\)$/);
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
