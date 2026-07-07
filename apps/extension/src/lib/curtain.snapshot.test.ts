/**
 * Curtain STRUCTURAL snapshot tests — the markup-as-a-whole gate the
 * attribute-by-attribute suites (curtain.cover/replace/chip/colorScheme.test.ts)
 * can't give. A change that reshuffles the shadow tree, drops a token class, or
 * breaks the dark-mode bundle passes every property assertion while rendering
 * wrong; these snapshots catch it because they pin the rendered tree.
 *
 * Scope = STRUCTURAL ONLY (NOT pixels, NOT CSS text):
 *   - We snapshot the host's attributes + the shadow root's element tree.
 *   - The large, noisy `STYLES` constant inside `<style>` is collapsed to a
 *     `[styles len=N]` marker (see stripStyleText) so a CSS tweak does not churn
 *     the structural baseline — only a change to the markup or token classes does.
 *   - The dark/light difference is driven by the explicit `colorScheme` option
 *     (the `data-movar-color-scheme` attribute), NOT jsdom media emulation, so
 *     the snapshot is deterministic regardless of the host OS theme.
 *
 * Coverage: {cover, replace} × {pill, chip} × {light, dark}. File snapshots for
 * the larger pill cases; inline snapshots for the compact chip cases. Token
 * classes (`pill__*` / `chip__*`) and the `data-mode`/`data-skin`/`data-peek`/
 * `data-movar-color-scheme` attributes are asserted explicitly alongside the
 * snapshot so a baseline re-record can't silently bless a dropped class.
 */
import { describe, expect, it } from 'vitest';
import type { PageMode } from '@movar/page-mode/types';
import { attachCurtain } from './curtain';
import type { CurtainMode, CurtainSkin } from './curtain';
import { setBody, getHost, getShadow } from './dom-test-helpers';

/** Collapse the `<style>` text to a length marker so CSS edits don't churn the
 *  structural baseline — the whole point is to snapshot the element tree, not
 *  the stylesheet. Length (not a hash) keeps the diff human-readable when STYLES
 *  legitimately grows. */
function stripStyleText(shadowHtml: string): string {
  return shadowHtml.replace(
    /<style>([\s\S]*?)<\/style>/g,
    (_m, css: string) => `<style>[styles len=${css.length}]</style>`,
  );
}

/** Serialize a curtain's structure: the host's own outer markup (attributes +
 *  light-DOM children — none, since the curtain lives in the shadow root) plus
 *  the shadow tree with the stylesheet text stripped. This is the structural
 *  fingerprint a snapshot pins. */
function serializeCurtain(host: HTMLElement): string {
  const shadow = getShadow(host);
  return [`host: ${host.outerHTML}`, `shadow: ${stripStyleText(shadow.innerHTML)}`].join('\n');
}

function mountCover(skin: CurtainSkin, colorScheme: PageMode): HTMLElement {
  setBody('<div id="target"><span>original content</span></div>');
  const target = document.querySelector<HTMLElement>('#target')!;
  attachCurtain(target, {
    mode: 'cover',
    skin,
    icon: '⚑',
    title: 'Прихований вміст',
    description: 'Movar приховав цей блок.',
    actions: [
      { label: 'Показати', onClick: () => {}, variant: 'primary' },
      { label: 'Налаштування', onClick: () => {}, variant: 'ghost' },
    ],
    colorScheme,
  });
  return getHost()!;
}

function mountReplace(skin: CurtainSkin, colorScheme: PageMode): HTMLElement {
  setBody('<div id="parent"><span id="target">original</span></div>');
  const target = document.querySelector<HTMLElement>('#target')!;
  attachCurtain(target, {
    mode: 'replace',
    skin,
    icon: '⚑',
    title: 'Українська',
    description: 'Movar приховав цей перемикач мов.',
    actions: [{ label: 'Показати', onClick: () => {} }],
    colorScheme,
  });
  return getHost()!;
}

const SCHEMES: readonly PageMode[] = ['light', 'dark'];

/** Common host-attribute assertions shared by every case, so a snapshot
 *  re-record can't silently bless a dropped data-* attribute. */
function expectHostAttrs(
  host: HTMLElement,
  mode: CurtainMode,
  skin: CurtainSkin,
  colorScheme: PageMode,
): void {
  expect(host.dataset['mode']).toBe(mode);
  expect(host.dataset['skin']).toBe(skin);
  expect(host.getAttribute('data-movar-color-scheme')).toBe(colorScheme);
  expect(host.dataset['state']).toBe('ready');
  if (mode === 'cover') {
    expect(host.dataset['peek']).toBe('true');
  } else {
    expect('peek' in host.dataset).toBe(false);
  }
}

describe('curtain structural snapshots — pill skin', () => {
  for (const scheme of SCHEMES) {
    it(`cover + pill + ${scheme}`, () => {
      const host = mountCover('pill', scheme);
      expectHostAttrs(host, 'cover', 'pill', scheme);
      const shadow = getShadow(host);
      // Token classes present (structural, not pixel).
      for (const cls of [
        'pill',
        'pill__header',
        'pill__icon',
        'pill__title',
        'pill__description',
        'pill__actions',
      ]) {
        expect(shadow.querySelector(`.${cls}`), `missing .${cls}`).not.toBeNull();
      }
      expect(shadow.querySelector('.pill__action--primary')).not.toBeNull();
      expect(shadow.querySelector('.pill__action--ghost')).not.toBeNull();
      expect(serializeCurtain(host)).toMatchSnapshot();
    });

    it(`replace + pill + ${scheme}`, () => {
      const host = mountReplace('pill', scheme);
      expectHostAttrs(host, 'replace', 'pill', scheme);
      expect(getShadow(host).querySelector('.pill')).not.toBeNull();
      expect(serializeCurtain(host)).toMatchSnapshot();
    });
  }
});

describe('curtain structural snapshots — chip skin', () => {
  it('cover + chip + light', () => {
    const host = mountCover('chip', 'light');
    expectHostAttrs(host, 'cover', 'chip', 'light');
    const shadow = getShadow(host);
    expect(shadow.querySelector('button.chip')).not.toBeNull();
    expect(shadow.querySelector('.chip__icon')).not.toBeNull();
    expect(shadow.querySelector('.chip__label')).not.toBeNull();
    expect(serializeCurtain(host)).toMatchInlineSnapshot(`
      "host: <div data-movar-curtain="" data-mode="cover" data-skin="chip" data-peek="true" data-movar-color-scheme="light" title="Movar приховав цей блок." data-state="ready"></div>
      shadow: <style>[styles len=9313]</style><div class="curtain"><button class="chip" type="button" aria-label="Movar приховав цей блок."><span class="chip__icon" aria-hidden="true">⚑</span><span class="chip__label">Прихований вміст</span></button></div>"
    `);
  });

  it('cover + chip + dark', () => {
    const host = mountCover('chip', 'dark');
    expectHostAttrs(host, 'cover', 'chip', 'dark');
    expect(serializeCurtain(host)).toMatchInlineSnapshot(`
      "host: <div data-movar-curtain="" data-mode="cover" data-skin="chip" data-peek="true" data-movar-color-scheme="dark" title="Movar приховав цей блок." data-state="ready"></div>
      shadow: <style>[styles len=9313]</style><div class="curtain"><button class="chip" type="button" aria-label="Movar приховав цей блок."><span class="chip__icon" aria-hidden="true">⚑</span><span class="chip__label">Прихований вміст</span></button></div>"
    `);
  });

  it('replace + chip + light', () => {
    const host = mountReplace('chip', 'light');
    expectHostAttrs(host, 'replace', 'chip', 'light');
    const shadow = getShadow(host);
    expect(shadow.querySelector('button.chip')).not.toBeNull();
    expect(serializeCurtain(host)).toMatchInlineSnapshot(`
      "host: <div data-movar-curtain="" data-mode="replace" data-skin="chip" data-movar-color-scheme="light" title="Movar приховав цей перемикач мов." data-state="ready"></div>
      shadow: <style>[styles len=9313]</style><div class="curtain"><button class="chip" type="button" aria-label="Movar приховав цей перемикач мов."><span class="chip__icon" aria-hidden="true">⚑</span><span class="chip__label">Українська</span></button></div>"
    `);
  });

  it('replace + chip + dark', () => {
    const host = mountReplace('chip', 'dark');
    expectHostAttrs(host, 'replace', 'chip', 'dark');
    expect(serializeCurtain(host)).toMatchInlineSnapshot(`
      "host: <div data-movar-curtain="" data-mode="replace" data-skin="chip" data-movar-color-scheme="dark" title="Movar приховав цей перемикач мов." data-state="ready"></div>
      shadow: <style>[styles len=9313]</style><div class="curtain"><button class="chip" type="button" aria-label="Movar приховав цей перемикач мов."><span class="chip__icon" aria-hidden="true">⚑</span><span class="chip__label">Українська</span></button></div>"
    `);
  });
});
