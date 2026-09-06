/**
 * Corpus regression harness — content verdict surfaces (Google SERP, YouTube).
 *
 * The *correctness* gate for the content extractors, driven by trimmed REAL
 * saved pages (packages/page-content/fixtures/{google-serp,youtube}, see that
 * dir's README.md). For each fixture:
 *   1. shape-pin guard — assert the durable selectors the manifest declares are
 *      still present. A silent re-save that drops the contaminated card (the
 *      whole point of the fixture) fails LOUDLY here instead of passing
 *      vacuously (mirrors bosch-regression.test.ts).
 *   2. run the matching extractor (GOOGLE/YOUTUBE_EXTRACTOR),
 *   3. classify each node the way the product does — a node carrying a
 *      `declaredLang` goes through the DECLARED FUSION (buildDeclaredClassifier),
 *      everything else through classifyBySnippet — both against the manifest's
 *      roster, and
 *   4. assert the per-node verdict (hide | keep) + fromLang matches the manifest.
 *
 * "hide" ⟺ the classified language is in BLOCKED **and** in the manifest's
 * roster; "keep" ⟺ unknown, a non-blocked language, or a language the roster
 * never contained — mirroring content-conceal.ts's hide predicate (both
 * `concealIfBlocked` and `decideFused`) without coupling to user settings.
 *
 * The roster clause is not decoration. The fusion returns an out-of-roster
 * declaration VERBATIM, so a harness that dispatched on the declaration but
 * skipped the candidate check would reproduce the very defect `decideFused`
 * guards against instead of catching it (`sl-out-of-roster` pins that).
 *
 * Why this lives in the extension app, not packages/page-content: the harness
 * needs node:fs to read the corpus, and the page-content model package is kept
 * pure (no node types in its tsconfig). The extension already hosts the
 * sibling picker/redirect harness (corpus-pickers.test.ts) and the bosch
 * regression, so all fs-backed corpus harnesses share one node-typed home.
 *
 * NOTE: classifyBySnippet here runs the IN-PROCESS franc path
 * (francRung3Resolver injected directly), NOT the background-worker bridge.
 * That is correct for a unit harness — the bridge just proxies the same engine
 * (apps/extension/src/lib/lang-detect-bridge.ts) — so do NOT wire
 * browser.runtime into this Vitest run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import { concealsLanguage } from './content-conceal';
import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';
import type { PageExtractor } from '@movar/page-content/types';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../../packages/page-content/fixtures');

/** Canonical "keep Ukrainian, hide Russian" config — the verdict a fixture's
 *  hide/keep column is read against. Kept small and explicit so the harness
 *  stays a pure classification gate, independent of user settings. */
const BLOCKED: ReadonlySet<LanguageCode> = new Set(['ru']);

/** The languages a fixture's roster KEEPS — the harness's stand-in for
 *  `ContentFilterOptions.enabled`. Stated as "the roster minus the blocked"
 *  rather than as a second literal so a manifest can never declare a roster
 *  the enabled set contradicts.
 *
 *  The verdict itself is taken by the product's own `concealsLanguage`, which
 *  {@link runSurface} imports rather than restates: `!enabled.has(x)` alone is
 *  true for every language on earth, so it is that function's roster clause
 *  that stops an out-of-roster declaration from concealing a card
 *  (`sl-out-of-roster`). Modelling the gate as "∈ BLOCKED" here instead would
 *  make that fixture pass vacuously, since a hardcoded block list can never
 *  hold the codes at issue. */
function enabledFor(roster: ReadonlySet<LanguageCode>): ReadonlySet<LanguageCode> {
  return new Set([...roster].filter((code) => !BLOCKED.has(code)));
}

interface ExpectedNode {
  selector: string;
  note?: string;
  verdict: 'hide' | 'keep';
  fromLang: LanguageCode;
}

interface Manifest {
  extractor: string;
  roster: LanguageCode[];
  shape: { description?: string; selectors: Record<string, number> };
  nodes: ExpectedNode[];
}

/** Parse a fixture's HTML into a standalone document. Strip the <html> wrapper
 *  the same way bosch-regression.test does, so attributes on <html> don't fight
 *  the host document. */
function parseFixture(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.documentElement.innerHTML = html
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?html[^>]*>/gi, '');
  return doc;
}

/** All fixture basenames in a surface dir (paired *.fixture.html + *.expected.json). */
function fixtureNames(surface: string): string[] {
  const dir = path.join(FIXTURES_ROOT, surface);
  return readdirSync(dir)
    .filter((f: string) => f.endsWith('.fixture.html'))
    .map((f: string) => f.replace(/\.fixture\.html$/, ''))
    .toSorted();
}

function loadManifest(surface: string, name: string): Manifest {
  const raw = readFileSync(path.join(FIXTURES_ROOT, surface, `${name}.expected.json`), 'utf8');
  return JSON.parse(raw) as Manifest;
}

function loadDocument(surface: string, name: string): Document {
  const html = readFileSync(path.join(FIXTURES_ROOT, surface, `${name}.fixture.html`), 'utf8');
  return parseFixture(html);
}

/** Run an extractor over a fixture and classify every node, asserting the
 *  shape-pin guard + each manifest verdict. */
function runSurface(surface: string, name: string, extractor: PageExtractor): void {
  const manifest = loadManifest(surface, name);
  const doc = loadDocument(surface, name);
  const profiles = getProfiles(manifest.roster);

  describe(`${surface}/${name}`, () => {
    it('matches the pinned fixture shape (durable selectors present)', () => {
      for (const [selector, count] of Object.entries(manifest.shape.selectors)) {
        expect(doc.querySelectorAll(selector).length, `selector "${selector}" drifted`).toBe(count);
      }
    });

    const model = extractor.extract(doc);
    const roster = new Set<LanguageCode>(manifest.roster);
    const enabled = enabledFor(roster);
    const fuseDeclared = buildDeclaredClassifier(profiles);

    it(`extractor id is "${manifest.extractor}"`, () => {
      expect(model.extractor).toBe(manifest.extractor);
    });

    for (const expected of manifest.nodes) {
      it(`${expected.selector} → ${expected.verdict} (${expected.fromLang})`, () => {
        const node = model.nodes.find((n) => n.el.matches(expected.selector));
        expect(node, `no extracted node matched "${expected.selector}"`).toBeDefined();

        // Same dispatch the content filter uses: a declared node fuses its
        // declaration with its text, an undeclared one classifies on text alone.
        const declared = node!.declaredLang;
        const verdict =
          declared === undefined
            ? classifyBySnippet(node!.text, profiles, francRung3Resolver)
            : fuseDeclared(node!.text, declared);
        // The PRODUCT's predicate, imported — not a copy of it. See
        // `concealsLanguage` for why this is shared rather than mirrored.
        const observedVerdict = concealsLanguage(verdict.language, enabled, roster)
          ? 'hide'
          : 'keep';

        expect(verdict.language, `classified language for ${expected.selector}`).toBe(
          expected.fromLang,
        );
        expect(observedVerdict, `hide/keep verdict for ${expected.selector}`).toBe(
          expected.verdict,
        );
      });
    }
  });
}

describe('content corpus — real saved pages', () => {
  describe('google-serp', () => {
    for (const name of fixtureNames('google-serp')) {
      runSurface('google-serp', name, GOOGLE_EXTRACTOR);
    }
  });

  describe('youtube', () => {
    for (const name of fixtureNames('youtube')) {
      runSurface('youtube', name, YOUTUBE_EXTRACTOR);
    }
  });
});
