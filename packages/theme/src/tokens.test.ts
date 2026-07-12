import { describe, expect, it } from 'vitest';

import { renderHostCss, renderThemeCss, renderTokensCss } from './render';
import {
  breakpoints,
  color,
  colorDark,
  fontFamily,
  fontSizeUi,
  forest,
  radius,
  shadow,
  shadowDark,
  size,
  space,
} from './tokens';
import type { ColorToken } from './tokens';

const HEX = /^#[0-9a-f]{6}$/;
const colorNames = Object.keys(color.light) as ColorToken[];

describe('color tokens', () => {
  it('light and dark expose the same token names', () => {
    expect(Object.keys(color.dark).toSorted()).toEqual([...colorNames].toSorted());
  });

  it('every light and resolved-dark value is a 6-digit lowercase hex', () => {
    const bad = colorNames.filter((n) => !HEX.test(color.light[n]) || !HEX.test(color.dark[n]));
    expect(bad).toEqual([]);
  });

  it('every dark override actually changes its light value (no dead overrides)', () => {
    const light: Record<string, string> = { ...color.light };
    const dead = Object.entries(colorDark)
      .filter(([name, value]) => value === light[name])
      .map(([name]) => name);
    expect(dead).toEqual([]);
  });

  it('the theme-stable tokens are absent from the dark override set', () => {
    // The forest accent and the "on solid fill" foregrounds read correctly on
    // both themes, so they must never be overridden — that is a design invariant.
    for (const stable of ['accent', 'accent-on', 'danger-on'] as const) {
      expect(colorDark).not.toHaveProperty(stable);
    }
  });
});

describe('other token families', () => {
  it('the forest scale is valid hex', () => {
    const bad = Object.values(forest).filter((hex) => !HEX.test(hex));
    expect(bad).toEqual([]);
  });

  it('shadow light/dark share names and every dark override differs', () => {
    expect(Object.keys(shadow.dark).toSorted()).toEqual(Object.keys(shadow.light).toSorted());
    const light: Record<string, string> = { ...shadow.light };
    const dead = Object.entries(shadowDark).filter(([k, value]) => value === light[k]);
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

describe('CSS renderers', () => {
  it('tokens.css declares every color on :root, light and dark', () => {
    const css = renderTokensCss();
    expect(css).toContain(':root {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    const missing = colorNames.filter((n) => !css.includes(`--${n}: ${color.light[n]};`));
    expect(missing).toEqual([]);
    // Dark block carries exactly the overrides.
    const missingDark = Object.entries(colorDark).filter(
      ([n, v]) => !css.includes(`--${n}: ${v};`),
    );
    expect(missingDark).toEqual([]);
  });

  it('host CSS is the :host-scoped variant (no :root)', () => {
    const css = renderHostCss();
    expect(css).toContain(':host {');
    expect(css).not.toContain(':root');
  });

  it('theme CSS maps every semantic color and carries the static families', () => {
    const css = renderThemeCss();
    const unmapped = colorNames.filter((n) => !css.includes(`--color-${n}: var(--${n});`));
    expect(unmapped).toEqual([]);
    expect(css).toContain('--color-forest-700: #15803d;');
    expect(css).toContain(`--font-mono: ${fontFamily.mono};`);
    expect(css).toContain('--breakpoint-md: 768px;');
    expect(css).toContain(`--radius-card: ${radius.card};`);
  });
});
