import { describe, expect, it } from 'vitest';
import { collectNetwork } from './node';
import { deriveCapabilities } from '../capability';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';
import type { Evidence } from '../evidence';
import type { Stub } from './node.test-utils';
import {
  networkSource,
  firstPage,
  ruleResult,
  routed,
  recording,
  HOME,
  UK,
  DE,
  HOME_ROBOTS,
  ALLOW_ALL,
  DE_PAGE,
} from './node.test-utils';

describe('collectNetwork', () => {
  /**
   * The pathological chain, end to end — collector to verdict.
   *
   * `probe.ts` walks a chain hop by hop precisely because `core/switch-bounces`
   * is adjudicated entirely from what that walk records. A chain past the hop
   * ceiling used to leave the walk as `response: null`, which `resolveOutcome`
   * called `error` and `adjudicableProbes` dropped: eleven requests spent
   * against a live site, and the rule this product exists for read `pass` off
   * the one declared target that behaved, with no trace of the one that did
   * not. Asserted through `CORE_RULESET` rather than at the probe, because a
   * probe-level assertion passes while the chain still never reaches a rule.
   */
  describe('a chain longer than the hop ceiling', () => {
    const RU_DRILL = 'https://example.com/ru/drill';
    const UK_DRILL = 'https://example.com/uk/drill';
    const EN_DRILL = 'https://example.com/en/drill';
    /** `hop <= maxHops` runs the loop `maxHops + 1` times, so eleven are recorded. */
    const RECORDED_HOPS = 11;

    const RU_DRILL_PAGE =
      '<html lang="ru"><head><link rel="alternate" hreflang="uk" href="/uk/drill">' +
      '<link rel="alternate" hreflang="en" href="/en/drill"></head>' +
      '<body><p>Дрель ударная</p></body></html>';
    const EN_DRILL_PAGE =
      '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/drill">' +
      '<link rel="alternate" hreflang="en" href="/en/drill"></head>' +
      '<body><p>impact drill</p></body></html>';

    /** Each hop a URL never seen before, so only the ceiling ends the walk. */
    function endlessHops(): Record<string, Stub> {
      const routes: Record<string, Stub> = {};
      for (let n = 0; n <= RECORDED_HOPS; n += 1) {
        const from = n === 0 ? UK_DRILL : `${UK_DRILL}/${n}`;
        routes[from] = { status: 301, headers: { location: `/uk/drill/${n + 1}` } };
      }
      return routes;
    }

    async function collectDrill(): Promise<Evidence> {
      return collectNetwork({
        url: RU_DRILL,
        headers: [null],
        followDeclaredTargets: true,
        fetchImpl: routed({
          [RU_DRILL]: { status: 200, body: RU_DRILL_PAGE },
          [EN_DRILL]: { status: 200, body: EN_DRILL_PAGE },
          'https://example.com/robots.txt': { status: 200, body: ALLOW_ALL },
          ...endlessHops(),
        }),
      });
    }

    it('records the whole chain and says it never reached the end', async () => {
      const evidence = await collectDrill();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK_DRILL);

      expect(probe?.outcome).toBe('ok');
      expect(probe?.redirectChain).toHaveLength(RECORDED_HOPS);
      expect(probe?.redirectChainTruncated).toBe(true);
      // No body, so no page — a target the collector never reached still
      // withholds `traversal`, which the resolved `en` alternate supplies.
      expect(evidence.pages.map((page) => page.url)).toEqual([RU_DRILL, EN_DRILL]);
      expect(deriveCapabilities(evidence).has('traversal')).toBe(true);
    });

    it('hands core/switch-bounces the chain instead of a silent pass', async () => {
      const evidence = await collectDrill();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK_DRILL);
      const result = ruleResult(evaluate(evidence, CORE_RULESET), 'core/switch-bounces');

      expect(result.verdict).toBe('warn');
      // Both collected pages declare the same broken `uk` alternate, so both
      // report it — reciprocal alternates are what correct markup looks like.
      expect(result.findings.map((finding) => finding.subject.url)).toEqual([RU_DRILL, EN_DRILL]);
      for (const finding of result.findings) {
        expect(finding.grounding).toBe('observed');
        expect(finding.evidence).toContainEqual({ kind: 'redirect-chain', probeId: probe?.id });
        expect(finding.summary).toContain('11 redirects');
        // The collector stopped one hop short of wherever this ends, so the
        // finding must not describe a landing it never saw.
        expect(finding.summary).not.toMatch(/lands on/u);
      }
    });

    /**
     * Seeing the chain is the point; turning the report green is not — and this
     * used to read the second as licence for the first. The `uk` alternate is
     * absent from the collected page set because the collector stopped walking
     * at hop eleven, so `core/hreflang-target-unresolvable`'s `declared` **fail**
     * — _"the declared alternate cannot be reached"_ — was the collector's own
     * ceiling published as a fact about the site, in the same report as the
     * `switch-bounces` warn saying reachability _"was not determined"_.
     *
     * It is withheld now, and withholding is not green: the rule reads
     * `not-applicable` rather than `pass`, so nothing here says the target
     * resolves either. The warn below is what the run actually observed.
     */
    it('withholds core/hreflang-target-unresolvable on the same target', async () => {
      const report = evaluate(await collectDrill(), CORE_RULESET);
      const result = ruleResult(report, 'core/hreflang-target-unresolvable');

      expect(result.findings).toEqual([]);
      expect(result.verdict).toBe('not-applicable');
      expect(result.verdict).not.toBe('pass');
      // Both pages declare the same unwalked `uk` target, so neither adjudicates.
      expect(result.pagesAdjudicated).toBe(0);
      expect(ruleResult(report, 'core/switch-bounces').verdict).toBe('warn');
    });
  });

  /**
   * A chain the **budget** ended, rather than the hop cap.
   *
   * `spend()` sits inside the per-hop fetch, so one `probe()` costs 1 to
   * `maxHops + 1` requests and a redirecting declared target can reach the
   * ceiling on a hop nobody could have predicted. `RequestBudgetExhaustedError`
   * then came out of `collectNetwork` and took the whole audit with it — a user
   * who set a tight `--budget` on a site with a redirecting alternate got a
   * crash instead of a partial report, and the throw depended on hop counts
   * they had no way to predict. Adjudicated through `CORE_RULESET`, not just
   * asserted on the probe: a run that reports nothing is exactly what this is
   * about.
   */
  describe('a chain the request budget ended', () => {
    /** Two declared targets: one that serves, and one that redirects forever. */
    const TWO_TARGETS_PAGE =
      '<html lang="en"><head><link rel="alternate" hreflang="de" href="/de/">' +
      '<link rel="alternate" hreflang="uk" href="/uk/"></head>' +
      '<body><p>english body</p></body></html>';

    /** Each hop a URL never seen before, so only a ceiling can end the walk. */
    function endlessUkHops(): Record<string, Stub> {
      const routes: Record<string, Stub> = {};
      for (let n = 0; n <= 8; n += 1) {
        const from = n === 0 ? UK : `${UK}${n}`;
        routes[from] = { status: 302, headers: { location: `/uk/${n + 1}` } };
      }
      return routes;
    }

    const ROUTES: Record<string, Stub> = {
      [HOME]: { status: 200, body: TWO_TARGETS_PAGE },
      [HOME_ROBOTS]: { status: 200, body: ALLOW_ALL },
      [DE]: { status: 200, body: DE_PAGE },
      ...endlessUkHops(),
    };

    /**
     * Five requests buys `/` (1), `example.com/robots.txt` (2), the `de`
     * alternate (3) and two hops of the `uk` one (4, 5) — the walk then wants a
     * sixth and has none. The `de` target is what grants `traversal`, so the
     * switch rules are genuinely adjudicated rather than `not-collected`.
     */
    async function collectOnFive(log?: string[]): Promise<Evidence> {
      const inner = routed(ROUTES);
      return collectNetwork({
        url: HOME,
        headers: [null],
        followDeclaredTargets: true,
        budget: 5,
        fetchImpl: log === undefined ? inner : recording(log, inner),
      });
    }

    it('reports what it collected instead of throwing out of collectNetwork', async () => {
      const evidence = await collectOnFive();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK);

      expect(evidence.pages.map((page) => page.url)).toEqual([HOME, DE]);
      expect(probe?.outcome).toBe('ok');
      expect(probe?.redirectChain).toHaveLength(2);
      // The last hop really did answer 302; `0` would claim no response at all.
      expect(probe?.status).toBe(302);
    });

    /**
     * Marked by the same flag the hop cap sets, so every rule that already asks
     * "did this walk see the end?" is right about this chain without being
     * taught a second question. `core/switch-bounces` consequently warns off
     * the hops it did see — never a bounce, never a `pass`.
     */
    it('hands core/switch-bounces a truncated chain, not a silent pass', async () => {
      const evidence = await collectOnFive();
      const probe = networkSource(evidence).probes.find((entry) => entry.url === UK);
      const result = ruleResult(evaluate(evidence, CORE_RULESET), 'core/switch-bounces');
      const unfinished = result.findings.filter((finding) => finding.summary.includes('uk'));

      expect(probe?.redirectChainTruncated).toBe(true);
      expect(result.verdict).toBe('warn');
      expect(unfinished).toHaveLength(1);
      expect(unfinished[0]?.grounding).toBe('observed');
      expect(unfinished[0]?.summary).toContain('2 redirects');
      // The collector stopped short of wherever this ends, so the finding must
      // not describe a landing it never saw.
      expect(unfinished[0]?.summary).not.toMatch(/lands on/u);
    });

    /** Every request the budget had, and not one past it. */
    it('spends the whole budget and stops exactly there', async () => {
      const fetched: string[] = [];
      await collectOnFive(fetched);
      expect(fetched).toEqual([HOME, HOME_ROBOTS, DE, UK, `${UK}1`]);
    });

    /**
     * The cost of finishing the run instead of throwing: a report now *exists*
     * where none did, and every rule in it is answering about a site whose
     * `/uk/` nobody finished following.
     *
     * `core/hreflang-target-unresolvable` resolves a declared target against
     * the collected page set and a truncated chain produces no page, so it read
     * the operator's `--budget` as the site's defect and published a `declared`
     * **fail** — "absent from the collected page set" — in the same report as
     * the `switch-bounces` warn saying reachability was not determined. Two
     * findings contradicting each other, the accusing one carrying the verdict.
     * The same hazard is older than the budget path: an 11-hop chain sets the
     * same flag and failed here too.
     */
    it('withholds the core/hreflang-target-unresolvable fail it never observed', async () => {
      const report = evaluate(await collectOnFive(), CORE_RULESET);
      const unresolvable = ruleResult(report, 'core/hreflang-target-unresolvable');
      const bounces = ruleResult(report, 'core/switch-bounces');

      expect(unresolvable.findings).toEqual([]);
      expect(unresolvable.verdict).not.toBe('fail');
      // ...and withholding is not passing. Silence here would say every
      // declared target resolves, of a page whose `uk` target was followed two
      // hops and no further — `not-collected` is never `pass`, and neither is
      // an accusation the collector simply could not gather the evidence for.
      expect(unresolvable.verdict).not.toBe('pass');
      // The honest statement about that chain survives, in the rule that saw it.
      expect(bounces.verdict).toBe('warn');
      expect(bounces.findings.map((finding) => finding.summary)).toContainEqual(
        expect.stringContaining('was not determined'),
      );
    });
  });

  /**
   * A redirect's own `Link` header belongs to the redirect, not to the page it
   * points at.
   *
   * `responseHeaders` is deliberately the FIRST response's — `Vary` is about
   * the resource a shared cache stores for the probed URL — and it was being
   * folded into the digest of the document at the END of the chain. Two
   * resources' declarations in one `DocumentEvidence`, which
   * `core/inventory-sources-disagree` then published as a defect of the site,
   * in both directions at once. Neither resource disagrees with itself.
   */
  describe('a redirect that carries its own Link alternates', () => {
    const REDIRECT_LINK = `<${DE}>; rel="alternate"; hreflang="de"`;
    /** The destination declares `uk` and nothing else. Its own markup, its own inventory. */
    const UK_ONLY_PAGE =
      '<html lang="uk"><head><link rel="alternate" hreflang="uk" href="/uk/"></head>' +
      '<body><p>українське тіло сторінки</p></body></html>';

    async function collectRedirected(destination: Stub): Promise<Evidence> {
      return collectNetwork({
        url: HOME,
        headers: [null],
        fetchImpl: routed({
          [HOME]: {
            status: 302,
            headers: { location: UK, link: REDIRECT_LINK, 'content-language': 'de' },
          },
          [UK]: destination,
        }),
      });
    }

    it('digests the destination with its own inventory, not the redirect’s', async () => {
      const evidence = await collectRedirected({ status: 200, body: UK_ONLY_PAGE });
      const page = firstPage(evidence);

      expect(page.url).toBe(UK);
      expect(page.document.alternates.map((alternate) => alternate.hreflang)).toEqual(['uk']);
      expect(page.document.alternates.every((alternate) => alternate.source === 'link')).toBe(true);
      // The same defect one field over: `Content-Language` is a head
      // declaration too, and `core/lang-contradicts-content-language` reads it.
      expect(page.document.head?.declarations.map((entry) => entry.kind)).not.toContain(
        'content-language',
      );
    });

    /** The exact reproduction from the report. Two `fail`s, one per direction. */
    it('publishes no core/inventory-sources-disagree finding', async () => {
      const evidence = await collectRedirected({ status: 200, body: UK_ONLY_PAGE });
      const result = ruleResult(
        evaluate(evidence, CORE_RULESET),
        'core/inventory-sources-disagree',
      );

      expect(result.findings).toEqual([]);
      expect(result.verdict).not.toBe('fail');
    });

    /**
     * The probe keeps both halves, and each caller names which it means.
     * `core/serving-vary-missing` asks about the redirect a shared cache stores
     * for `/`; the digest asks about the document `/uk/` served.
     */
    it('keeps the first response’s headers on the probe for Vary semantics', async () => {
      const evidence = await collectRedirected({ status: 200, body: UK_ONLY_PAGE });
      const probe = networkSource(evidence).probes[0];

      expect(probe?.responseHeaders['link']).toBe(REDIRECT_LINK);
      expect(probe?.finalResponseHeaders?.['link']).toBeUndefined();
    });

    /**
     * The other direction, so the fix is "read the right resource" rather than
     * "read no headers on a redirect": a `Link` header the DESTINATION serves
     * is that document's own declaration and is folded in exactly as before.
     */
    it('still folds in the destination’s own Link header', async () => {
      const evidence = await collectRedirected({
        status: 200,
        // A DIFFERENT `hreflang` from the redirect's, which is the whole test:
        // give both resources the same header and the assertion passes off
        // either one, leaving the direction the fix is about unpinned.
        headers: { link: '<https://example.com/fr/>; rel="alternate"; hreflang="fr"' },
        body: UK_ONLY_PAGE,
      });
      const page = firstPage(evidence);

      expect(page.document.alternates.map((alternate) => alternate.hreflang).toSorted()).toEqual([
        'fr',
        'uk',
      ]);
      expect(
        page.document.alternates.find((alternate) => alternate.hreflang === 'fr')?.source,
      ).toBe('header');
      // The redirect declared `de`, and the redirect is not this document.
      expect(page.document.alternates.map((alternate) => alternate.hreflang)).not.toContain('de');
    });
  });
});
