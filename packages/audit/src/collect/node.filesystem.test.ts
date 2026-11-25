import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { collectFilesystem, collectNetwork } from './node';
import { MAX_TEXT_NODE_SAMPLES } from './digest';
import { deriveCapabilities } from '../capability';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';
import { textNodeDenominator } from '../text-samples';
import type { Evidence, PageEvidence } from '../evidence';
import { firstPage, ruleResult, routed, HOME, EN_PAGE, buildSite } from './node.test-utils';

describe('collectFilesystem', () => {
  it('reads a built dist into pages addressed as the site would', async () => {
    const evidence = await collectFilesystem({ root: await buildSite() });
    const paths = evidence.pages.map((page) => page.path ?? '');
    expect(paths.toSorted((one, other) => one.localeCompare(other))).toEqual([
      '/index.html',
      '/uk/index.html',
    ]);
    expect(evidence.pages.every((page) => page.url === undefined)).toBe(true);
  });

  /**
   * A filesystem has no network location, so matrix rules must be structurally
   * `not-collected` rather than quietly passing.
   */
  it('carries no vantage and no probes, so matrix rules cannot run', async () => {
    const evidence = await collectFilesystem({ root: await buildSite() });
    expect(evidence.source.kind).toBe('filesystem');
    const capabilities = deriveCapabilities(evidence);
    expect(capabilities.has('static')).toBe(true);
    expect(capabilities.has('site')).toBe(true);
    // Free on a build: the next file is right there.
    expect(capabilities.has('traversal')).toBe(true);
    expect(capabilities.has('http')).toBe(false);
    expect(capabilities.has('matrix')).toBe(false);
    expect(capabilities.has('multi-vantage')).toBe(false);
  });

  it('caps how many pages a huge build contributes', async () => {
    const evidence = await collectFilesystem({ root: await buildSite(), maxPages: 1 });
    expect(evidence.pages).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The sampling report, carried across the collector boundary                  */
/* -------------------------------------------------------------------------- */

/** More eligible text nodes than the cap admits — the issue's own repro size. */
const CAPPED_PAGE_NODES = 4000;

/**
 * Slow by construction, so it gets its own timeout — the same argument as the
 * cap test in `digest.test.ts`. Proving the cap is *carried* needs a page that
 * actually exceeds it, and v8 coverage instrumentation on a shared CI runner
 * pushes that past vitest's 5s default.
 */
const CAP_TEST_TIMEOUT_MS = 30_000;

/** A body with `count` eligible text nodes and no whitespace-only ones. */
function manyTextNodes(count: number): string {
  const paragraphs = Array.from({ length: count }, (_, index) => `<p>текст ${index}</p>`).join('');
  return `<html lang="uk"><body>${paragraphs}</body></html>`;
}

async function buildCappedPage(): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-capped-'));
  await writeFile(nodePath.join(root, 'index.html'), manyTextNodes(CAPPED_PAGE_NODES), 'utf8');
  return root;
}

describe('text sampling', () => {
  /**
   * The digest has always known the cap bit; the collectors used to drop the
   * report on the floor, so `Evidence` could not tell a 1500-node page from a
   * truncated 4000-node one. Every classified denominator then quoted 1500 and
   * inflated the share it published by 2.7×.
   */
  it(
    'carries the true examined count out of the filesystem collector',
    async () => {
      const page = firstPage(await collectFilesystem({ root: await buildCappedPage() }));

      expect(page.document.textNodes).toHaveLength(MAX_TEXT_NODE_SAMPLES);
      expect(page.document.textSampling).toEqual({
        examined: CAPPED_PAGE_NODES,
        sampled: MAX_TEXT_NODE_SAMPLES,
        cappedAt: MAX_TEXT_NODE_SAMPLES,
      });
    },
    CAP_TEST_TIMEOUT_MS,
  );

  /** "3 of 4000 text nodes" is the finding; "3 of 1500" is the smear. */
  it(
    'makes the published denominator quote what was examined, not what survived',
    async () => {
      const page = firstPage(await collectFilesystem({ root: await buildCappedPage() }));

      expect(textNodeDenominator(page, 3)).toEqual({ examined: CAPPED_PAGE_NODES, matched: 3 });
    },
    CAP_TEST_TIMEOUT_MS,
  );

  it('carries the counts out of the network collector too', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const page = firstPage(evidence);

    expect(page.document.textSampling).toEqual({
      examined: page.document.textNodes.length,
      sampled: page.document.textNodes.length,
    });
    // Nothing was dropped, so nothing claims it was.
    expect(page.document.textSampling?.cappedAt).toBeUndefined();
  });

  /** Evidence is a stored, replayable bundle — the counts must survive JSON. */
  it('survives serialization, so a stored bundle replays with the same denominator', async () => {
    const evidence = await collectNetwork({
      url: HOME,
      headers: [null],
      fetchImpl: routed({ [HOME]: { status: 200, body: EN_PAGE } }),
    });
    const stored = JSON.stringify(evidence);
    const replayed = JSON.parse(stored) as Evidence;

    expect(firstPage(replayed).document.textSampling).toEqual(
      firstPage(evidence).document.textSampling,
    );
  });

  /**
   * A stored `schemaVersion` 2 bundle carries no counts at all. The denominator
   * falls back to what it can see rather than reporting zero examined nodes —
   * an empty denominator would read as a far worse claim than a modest one.
   */
  it('falls back to the sampled count on a bundle collected before the field existed', () => {
    const legacy: PageEvidence = {
      id: 'page-1',
      url: HOME,
      reach: 'requested',
      rendered: false,
      document: {
        htmlLang: 'uk',
        langAttributes: [],
        alternates: [],
        picker: null,
        links: [],
        textNodes: [{ nodePath: 'body > p', text: 'текст', inheritedLang: null }],
      },
    };

    expect(textNodeDenominator(legacy, 1)).toEqual({ examined: 1, matched: 1 });
  });
});

/**
 * A `lang="uk"` page whose head declares no `<title>` and whose body carries an
 * icon with an English accessible name. Long enough to clear the classifier's
 * reportable gate, which is what makes the old behaviour a published finding
 * rather than a near miss.
 */
const ICON_TITLE_PAGE =
  '<html lang="uk"><head><meta name="description" content="Найкращі товари за найкращими цінами."></head>' +
  '<body><button aria-label="Кошик"><svg viewBox="0 0 24 24">' +
  '<title>Diagram showing how our delivery network reaches every region</title></svg></button>' +
  '<main><p>Ми доставляємо замовлення по всій Україні протягом двох робочих днів.</p></main></body></html>';

/** The same page shape, with a third-party widget's `<meta>` sitting in the body. */
const BODY_META_PAGE =
  '<html lang="uk"><head><title>Магазин</title></head>' +
  '<body><div class="widget"><meta http-equiv="content-language" content="ru"></div>' +
  '<p>Ми доставляємо замовлення по всій Україні протягом двох робочих днів.</p></body></html>';

async function buildPage(html: string): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-audit-head-'));
  await writeFile(nodePath.join(root, 'index.html'), html, 'utf8');
  return root;
}

/**
 * Asserted through the ruleset, never against the digest alone: both defects
 * were one document-wide selector away from a published finding about an
 * element the head never carried, and it is the verdict — not the sample — that
 * a site owner reads.
 */
describe('the head tier reads the head', () => {
  it('does not adjudicate an icon tooltip as the page title', async () => {
    const evidence = await collectFilesystem({ root: await buildPage(ICON_TITLE_PAGE) });
    const result = ruleResult(
      evaluate(evidence, CORE_RULESET),
      'core/title-contradicts-declaration',
    );

    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toContain('no <title>');
    expect(result.findings).toEqual([]);
  });

  it("does not fail a page for a body widget's content-language", async () => {
    const evidence = await collectFilesystem({ root: await buildPage(BODY_META_PAGE) });
    const report = evaluate(evidence, CORE_RULESET);
    const result = ruleResult(report, 'core/lang-contradicts-content-language');

    expect(result.verdict).toBe('not-applicable');
    expect(result.findings).toEqual([]);
    expect(report.brokenPromises).toBe(0);
  });
});
