/**
 * Corpus regression harness — picker + redirect verdict surfaces.
 *
 * The sites in packages/page-content/fixtures/{pickers,redirect-sites} have NO
 * PageContentModel (no text serialized for the franc classifier), so they can't
 * ride the content harness in packages/page-content/src/corpus.test.ts. Their
 * correctness gate is:
 *   - pickers/        → @movar/lang-pickers (findLanguagePickers +
 *                       classifyLanguageElement): the picker is detected, its
 *                       links classify to the expected languages, and the
 *                       negative anchors do NOT classify as language links.
 *   - redirect-sites/ → getRuleForHost (apps/extension/src/sites/registry.ts):
 *                       the host resolves to the expected rule + strategy.
 *                       electrica-shop additionally carries an on-page picker.
 *
 * Each fixture's manifest carries a shape-pin guard (selector → count) asserted
 * before the verdicts, so a vacuous re-save fails loudly (mirrors
 * bosch-regression.test.ts). See ../../../../packages/page-content/fixtures/README.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LanguageCode } from '@movar/lang-detect';
import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { getRuleForHost } from '../sites/registry';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../packages/page-content/fixtures');

interface PickerExpectation {
  container?: string;
  containerId?: string;
  containerMatches?: string;
  links: number;
  languages: LanguageCode[];
}

interface ShapeGuard {
  selectors?: Record<string, number>;
  minSelectors?: Record<string, number>;
}

interface PickerManifest {
  surface: 'picker';
  shape: ShapeGuard;
  picker: PickerExpectation;
  negatives?: { selector: string; note?: string }[];
}

interface RedirectManifest {
  surface: 'redirect';
  host: string;
  shape: ShapeGuard;
  rule: { match: string; strategyType: string };
  picker?: PickerExpectation;
}

/** Read + parse a manifest. Returns the discriminated union; callers narrow on
 *  `surface` (the harness knows which dir it loaded from). */
function loadManifest(surface: string, name: string): PickerManifest | RedirectManifest {
  return JSON.parse(
    readFileSync(path.join(FIXTURES_ROOT, surface, `${name}.expected.json`), 'utf8'),
  ) as PickerManifest | RedirectManifest;
}

function loadPickerManifest(name: string): PickerManifest {
  const manifest = loadManifest('pickers', name);
  if (manifest.surface !== 'picker') throw new Error(`expected a picker manifest for ${name}`);
  return manifest;
}

function loadRedirectManifest(name: string): RedirectManifest {
  const manifest = loadManifest('redirect-sites', name);
  if (manifest.surface !== 'redirect') throw new Error(`expected a redirect manifest for ${name}`);
  return manifest;
}

function loadHtml(surface: string, name: string): string {
  return readFileSync(path.join(FIXTURES_ROOT, surface, `${name}.fixture.html`), 'utf8');
}

/** Mount a fixture into the live document (strip the <html> wrapper so its
 *  attributes don't fight document.documentElement) — the same shape the
 *  picker logic walks in the content script. */
function mount(html: string): void {
  document.documentElement.innerHTML = html
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?html[^>]*>/gi, '');
}

/** Shape-pin guard as a pure check: return one message per drifted selector
 *  (empty array = shape intact). Returning rather than asserting keeps the
 *  `expect` in the test body so the assertion is visible to lint and the
 *  failure message names the offending selector. */
function shapeViolations(shape: ShapeGuard): string[] {
  const violations: string[] = [];
  for (const [selector, count] of Object.entries(shape.selectors ?? {})) {
    const actual = document.querySelectorAll(selector).length;
    if (actual !== count)
      violations.push(`"${selector}" drifted: expected ${count}, found ${actual}`);
  }
  for (const [selector, min] of Object.entries(shape.minSelectors ?? {})) {
    const actual = document.querySelectorAll(selector).length;
    if (actual < min) violations.push(`"${selector}" dropped below ${min}: found ${actual}`);
  }
  return violations;
}

/** Find the picker matching the manifest's container expectation among all
 *  detected pickers (keyed by id / selector / tag — so a found match already
 *  proves the container identity) and return its sorted detected languages. */
function pickPicker(expectation: PickerExpectation): LanguageCode[] {
  const pickers = findLanguagePickers();
  const match = pickers.find((p) => {
    if (expectation.containerId != null) return p.container.id === expectation.containerId;
    if (expectation.containerMatches != null)
      return p.container.matches(expectation.containerMatches);
    if (expectation.container != null) return p.container.tagName === expectation.container;
    return true;
  });
  expect(match, 'no detected picker matched the manifest expectation').toBeDefined();
  return match!.links.map((l) => l.language).toSorted();
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

describe('corpus — picker fixtures (@movar/lang-pickers)', () => {
  const pickerFixtures = [
    'bosch-form-button',
    'select-cs-cart',
    'button-data-lang',
    'bare-text-001',
  ] as const;

  for (const name of pickerFixtures) {
    describe(`pickers/${name}`, () => {
      const manifest = loadPickerManifest(name);
      const html = loadHtml('pickers', name);

      it('matches the pinned fixture shape', () => {
        mount(html);
        expect(shapeViolations(manifest.shape)).toEqual([]);
      });

      it(`detects the picker → ${manifest.picker.languages.join(', ')}`, () => {
        mount(html);
        // pickPicker matches by container id / selector / tag, so a found match
        // already proves the container identity — assert only the languages here.
        const languages = pickPicker(manifest.picker);
        expect(languages).toHaveLength(manifest.picker.links);
        expect(languages).toEqual(manifest.picker.languages.toSorted());
      });

      for (const negative of manifest.negatives ?? []) {
        it(`does NOT classify "${negative.selector}" as a language link`, () => {
          mount(html);
          const anchors = document.querySelectorAll<HTMLElement>(negative.selector);
          expect(
            anchors.length,
            `negative selector "${negative.selector}" matched nothing`,
          ).toBeGreaterThan(0);
          for (const el of anchors) {
            expect(classifyLanguageElement(el)).toBeNull();
          }
        });
      }
    });
  }
});

describe('corpus — redirect-site fixtures (getRuleForHost)', () => {
  const redirectFixtures = ['bing-serp', 'duckduckgo-serp', 'electrica-shop'] as const;

  for (const name of redirectFixtures) {
    describe(`redirect-sites/${name}`, () => {
      const manifest = loadRedirectManifest(name);
      const html = loadHtml('redirect-sites', name);

      it('matches the pinned fixture shape', () => {
        mount(html);
        expect(shapeViolations(manifest.shape)).toEqual([]);
      });

      it(`getRuleForHost("${manifest.host}") → ${manifest.rule.match} (${manifest.rule.strategyType})`, () => {
        const rule = getRuleForHost(manifest.host);
        expect(rule, `no rule resolved for ${manifest.host}`).toBeDefined();
        expect(rule!.match).toBe(manifest.rule.match);
        expect(rule!.strategy.type).toBe(manifest.rule.strategyType);
      });

      if (manifest.picker) {
        const picker = manifest.picker;
        it(`detects the on-page picker → ${picker.languages.join(', ')}`, () => {
          mount(html);
          const languages = pickPicker(picker);
          expect(languages).toHaveLength(picker.links);
          expect(languages).toEqual(picker.languages.toSorted());
        });
      }
    });
  }
});
