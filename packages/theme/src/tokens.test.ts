import { describe, expect, it } from 'vitest';

import {
  renderBreakpointCss,
  renderColorCss,
  renderRadiusCss,
  renderShadowCss,
  renderSizeCss,
  renderSpaceCss,
  renderTypographyCss,
} from './render';
import {
  breakpoints,
  color,
  colorDark,
  colorDarkOverrides,
  colorLight,
  fontFamily,
  fontSizeUi,
  forest,
  radius,
  shadow,
  shadowDark,
  shadowDarkOverrides,
  size,
  space,
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
    for (const group of [fontFamily, fontSizeUi, space, radius, breakpoints]) {
      for (const [k, v] of Object.entries(group)) {
        if (typeof v !== 'string' || v.length === 0) bad.push(k);
      }
    }
    expect(bad).toEqual([]);
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

  it('typography.css carries the UI scale + type faces', () => {
    const css = renderTypographyCss();
    expect(css).toContain('--text-ui-base: 13px;');
    expect(css).toContain('--text-ui-base: var(--text-ui-base);');
    expect(css).toContain(`--font-mono: ${fontFamily.mono};`);
  });

  it('shadow.css carries the elevation vars + wiring', () => {
    const css = renderShadowCss();
    expect(css).toContain('--shadow-lg:');
    expect(css).toContain('--shadow-lg: var(--shadow-lg);');
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
      renderSpaceCss(),
      renderSizeCss(),
    ]) {
      expect(css).toContain(':root, :host {');
    }
  });
});
