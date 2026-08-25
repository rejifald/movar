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
 * Every picker fixture additionally carries a REQUIRED `page` block, because
 * classification alone never caught the bugs that actually reached users.
 * hotline.ua classified both of its entries perfectly and still read every
 * Ukrainian page as Russian, then stripped the query off product links. So the
 * manifest also pins the three verdicts downstream of classification:
 *
 *   activeLanguage   → which entry buildPickerModel calls the current one
 *   detectedLanguage → what detectPageLanguage concludes for the whole page
 *   expectNavigation → whether the switch ladder navigates, and to where
 *
 * `expectNavigation: false` is the do-no-harm invariant: a fixture already
 * serving the target language must produce ZERO navigations. It is required
 * rather than optional so a new fixture cannot silently opt out of the gate
 * that three separate user-visible incidents (bosch, yato, hotline) needed.
 *
 * Each fixture's manifest carries a shape-pin guard (selector → count) asserted
 * before the verdicts, so a vacuous re-save fails loudly (mirrors
 * bosch-regression.test.ts). See ../../../../packages/page-content/fixtures/README.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LanguageCode } from '@movar/lang-detect';
import { defaultSettings } from '@movar/settings';
import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import {
  detectPageLanguage,
  languageFromHtmlLang,
  languageFromSelfHreflang,
} from '@movar/page-language';
import { applyStrategy } from './strategy';
import { attemptLanguageSwitch } from './language-switch';
import { clearAttempt, hasAttemptedNavTo, markAttempt, recentlyAttemptedHere } from './loop-guard';
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

/** The page-level scenario a picker fixture is pinned against. Required on
 *  every picker manifest — see the file header for why. `htmlLang` and `url`
 *  are declared here rather than read off the fixture because `mount()` strips
 *  the `<html>` wrapper (its attributes would fight document.documentElement)
 *  and a saved page carries no location. */
interface PageExpectation {
  /** The URL the scenario runs at. Drives hostname/path tiers, the picker's
   *  self-link check, and hreflang's don't-bounce-in-place comparison. */
  url: string;
  /** The `<html lang>` the live page serves, or null when it declares none. */
  htmlLang: string | null;
  /** Expected `buildPickerModel(...).activeLanguage` — null means "the picker
   *  markup does not single one entry out", which is a verdict worth pinning. */
  activeLanguage: LanguageCode | null;
  /** Expected `detectPageLanguage` for the whole page. */
  detectedLanguage: LanguageCode | null;
  /** Whether the switch ladder is expected to navigate away. */
  expectNavigation: boolean;
  /** When `expectNavigation`, the URL it must land on. */
  navigatesTo?: string;
  note?: string;
}

interface PickerManifest {
  surface: 'picker';
  shape: ShapeGuard;
  picker: PickerExpectation;
  page: PageExpectation;
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

/** Mount a fixture AND apply its declared page scenario (the `<html lang>` the
 *  live page serves, which `mount` strips along with the `<html>` wrapper). */
function mountPage(html: string, page: PageExpectation): void {
  mount(html);
  if (page.htmlLang != null) document.documentElement.setAttribute('lang', page.htmlLang);
  // jsdom serves every fixture from its own default origin, so a RELATIVE
  // picker href would resolve against localhost and never match `page.url` —
  // the self-link check ("this entry points at the page we're on") would then
  // silently never fire. A <base> makes relative hrefs resolve exactly as they
  // do on the live page.
  const base = document.createElement('base');
  base.href = page.url;
  document.head.prepend(base);
}

/** The `location`-shaped slice the detection chain reads. */
function locationFor(page: PageExpectation): Pick<Location, 'pathname' | 'hostname' | 'href'> {
  const url = new URL(page.url);
  return { href: page.url, pathname: url.pathname, hostname: url.hostname };
}

/**
 * Run the REAL switch ladder over the mounted fixture and report where (if
 * anywhere) it navigated. Everything page-derived comes from the fixture — the
 * hreflang alternates off its own `<head>`, the pickers off its own markup, the
 * rule off its own hostname — so a fixture that would strip a query in the
 * browser strips one here too.
 */
async function runSwitchLadder(
  page: PageExpectation,
): Promise<{ navigated: boolean; replacedWith: string | null }> {
  const loc = locationFor(page);
  let replacedWith: string | null = null;
  const pickers = findLanguagePickers();
  const pageLang = detectPageLanguage(document, loc);
  const navigated = await attemptLanguageSwitch(
    {
      recentlyAttemptedHere: () => recentlyAttemptedHere(page.url),
      hasAttemptedNavTo,
      markAttempt: (href?: string) => {
        markAttempt(href ?? page.url);
      },
      record: async () => {},
      applyStrategy,
      loopGuardCtx: {
        getUrl: () => new URL(page.url),
        navigate: (url: string) => {
          replacedWith = url;
        },
        getHreflangLinks: () =>
          [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map(
            (l) => ({ hreflang: l.hreflang, href: l.href }),
          ),
      },
      declaredLanguage: () =>
        languageFromHtmlLang(document) ?? languageFromSelfHreflang(document, page.url),
      location: {
        href: page.url,
        replace: (url: string) => {
          replacedWith = url;
        },
        reload: () => {
          replacedWith = page.url;
        },
      },
      setSimulatedClick: () => {},
    },
    { ...defaultSettings, contentModification: true },
    getRuleForHost(loc.hostname),
    pageLang,
    defaultSettings.priority[0],
    pickers,
  );
  return { navigated, replacedWith };
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
  document.documentElement.removeAttribute('lang');
  clearAttempt();
});

describe('corpus — picker fixtures (@movar/lang-pickers)', () => {
  const pickerFixtures = [
    'bosch-form-button',
    'select-cs-cart',
    'button-data-lang',
    'bare-text-001',
    'tradeport-lang-gate',
    'stls-value-attr',
    'hotline-bare-div-picker',
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

      const page = manifest.page;

      it(`active entry → ${page.activeLanguage ?? 'abstains'}`, () => {
        mountPage(html, page);
        const model = buildPickerModel(findLanguagePickers(), page.url);
        expect(model.activeLanguage).toBe(page.activeLanguage);
      });

      it(`detectPageLanguage → ${page.detectedLanguage ?? 'null'}`, () => {
        mountPage(html, page);
        expect(detectPageLanguage(document, locationFor(page))).toBe(page.detectedLanguage);
      });

      it(`switch ladder → ${page.expectNavigation ? (page.navigatesTo ?? 'navigates') : 'STANDS DOWN (do-no-harm)'}`, async () => {
        mountPage(html, page);
        const { navigated, replacedWith } = await runSwitchLadder(page);
        // One unconditional assertion over both halves of the verdict. When a
        // navigating fixture pins no `navigatesTo` (bosch switches by clicking a
        // form button, so no URL is replaced), that half echoes the actual value
        // and only `navigated` is under test.
        const expected = page.expectNavigation
          ? { navigated: true, replacedWith: page.navigatesTo ?? replacedWith }
          : { navigated: false, replacedWith: null };
        expect({ navigated, replacedWith }).toEqual(expected);
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
