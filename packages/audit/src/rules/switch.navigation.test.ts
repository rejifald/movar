import { describe, expect, it } from 'vitest';
import type { AlternateLink, Evidence, PickerOption, RedirectHop } from '../evidence';
import { CORE_RULESET } from '../ruleset';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makePicker,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';
import {
  resultFor,
  SHOP,
  RU_PRODUCT,
  UK_PRODUCT,
  ukAlternate,
  sourcePage,
  targetPage,
  pickerOption,
} from './switch.test-utils';

const UK_HOME = `${SHOP}/uk/`;

/** A 301 to the Ukrainian homepage, then a 302 straight back to the Russian page. */
const BOUNCE_CHAIN: readonly RedirectHop[] = [
  { url: UK_PRODUCT, status: 301, location: UK_HOME },
  { url: UK_HOME, status: 302, location: RU_PRODUCT },
];

function bounceEvidence(chain: readonly RedirectHop[]): Evidence {
  return networkEvidence(
    [sourcePage(), targetPage('ru')],
    [makeProbe({ id: 'probe-uk', url: UK_PRODUCT, acceptLanguage: null, redirectChain: chain })],
  );
}

/** Where a chain that outran the ceiling was pointing when the walk stopped. */
const DEAD_END = `${SHOP}/uk/11`;

/**
 * Eleven hops, every URL distinct — the `seen` check never fires, so nothing
 * but the collector's own ceiling ended this walk.
 */
function longChain(lastLocation: string): readonly RedirectHop[] {
  const hops: RedirectHop[] = [{ url: UK_PRODUCT, status: 301, location: `${SHOP}/uk/1` }];
  for (let hop = 1; hop < 10; hop += 1) {
    hops.push({ url: `${SHOP}/uk/${hop}`, status: 301, location: `${SHOP}/uk/${hop + 1}` });
  }
  hops.push({ url: `${SHOP}/uk/10`, status: 301, location: lastLocation });
  return hops;
}

/** What a collector writes when its hop ceiling, not the site, ended the walk. */
function truncatedEvidence(chain: readonly RedirectHop[]): Evidence {
  return networkEvidence(
    [sourcePage(), targetPage('ru')],
    [
      makeProbe({
        id: 'probe-uk',
        url: UK_PRODUCT,
        acceptLanguage: null,
        // The last 3xx it really got; `0` would claim no response at all.
        status: 301,
        redirectChain: chain,
        redirectChainTruncated: true,
      }),
    ],
  );
}

/** A page whose switcher a live DOM resolved — the only tier that can reach one. */
function renderedPicker(options: readonly PickerOption[]): Evidence {
  return networkEvidence([
    makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      rendered: true,
      document: makeDocument({
        htmlLang: 'ru',
        picker: makePicker({ kind: 'select', activeLabel: 'RU', options }),
      }),
    }),
  ]);
}

describe('core/switch-bounces', () => {
  const RULE = 'core/switch-bounces';

  it('fails the uk-ua hreflang that 301s back to the Russian URL', () => {
    const evidence = bounceEvidence(BOUNCE_CHAIN);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/answers 301 → 302/);
    expect(result.findings[0]?.summary).toMatch(/cannot be reached/);
    expect(result.findings[0]?.grounding).toBe('observed');
  });

  it('cites the complete redirect chain as the evidence', () => {
    const evidence = bounceEvidence(BOUNCE_CHAIN);
    const finding = resultFor(RULE, evidence).findings[0];
    expect(finding?.evidence[0]).toEqual({ kind: 'redirect-chain', probeId: 'probe-uk' });
    const cited =
      evidence.source.kind === 'network'
        ? evidence.source.probes.find((probe) => probe.id === 'probe-uk')
        : undefined;
    expect(cited?.redirectChain).toEqual(BOUNCE_CHAIN);
  });

  it('fails a chain that lands on any URL marked with the source language', () => {
    const chain: readonly RedirectHop[] = [
      { url: UK_PRODUCT, status: 301, location: `${SHOP}/ru/` },
    ];
    expect(resultFor(RULE, bounceEvidence(chain)).verdict).toBe('fail');
  });

  it('passes when the declared target answers without redirecting', () => {
    expect(resultFor(RULE, bounceEvidence([])).verdict).toBe('pass');
  });

  it('is not applicable when no probe followed a declared target', () => {
    const evidence = networkEvidence(
      [sourcePage(), targetPage('uk')],
      [makeProbe({ id: 'probe-ru', url: RU_PRODUCT, acceptLanguage: null })],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no probe followed a target/);
  });

  it('is not-collected without probes, never pass', () => {
    const result = resultFor(RULE, networkEvidence([sourcePage(), targetPage('uk')]));
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['http']);
  });

  /**
   * The chain the collector stopped walking — asserted through `CORE_RULESET`,
   * because a probe-level assertion passes while the chain never reaches a
   * rule, which is exactly the shape of the defect this covers.
   */
  describe('a chain the collector never finished', () => {
    it('publishes the hops it did see, as a warn rather than a silence', () => {
      const result = resultFor(RULE, truncatedEvidence(longChain(DEAD_END)), CORE_RULESET);

      expect(result.verdict).toBe('warn');
      expect(result.findings[0]?.grounding).toBe('observed');
      expect(result.findings[0]?.evidence[0]).toEqual({
        kind: 'redirect-chain',
        probeId: 'probe-uk',
      });
      expect(result.findings[0]?.summary).toContain('11 redirects');
      expect(result.findings[0]?.summary).toMatch(/was not determined/u);
    });

    /**
     * The last hop's `Location` names a URL nobody fetched — including when it
     * names the source page. A `fail` there would read as "the switch bounces
     * back", a claim about an end the walk never reached, and this rule's
     * findings are the ones that get quoted at a named company.
     */
    it('does not call it a bounce even when the last Location is the source page', () => {
      const result = resultFor(RULE, truncatedEvidence(longChain(RU_PRODUCT)), CORE_RULESET);

      expect(result.verdict).toBe('warn');
      expect(result.findings[0]?.summary).not.toMatch(/lands on/u);
    });

    /**
     * The control the whole inconsistency was measured against: a two-hop loop
     * reached an end the walk saw, carries no truncation flag, and stays a
     * `fail` with the chain cited. Eleven hops must not turn that green.
     */
    it('still fails the cyclic chain, which reached an end the walk saw', () => {
      const result = resultFor(RULE, bounceEvidence(BOUNCE_CHAIN), CORE_RULESET);

      expect(result.verdict).toBe('fail');
      expect(result.findings[0]?.summary).toMatch(/lands on/u);
    });

    /**
     * A bundle written before `schemaVersion` 4 recorded the same chain as an
     * `error` probe, which the kernel drops — so the rule reads `not-collected`
     * on it, and `not-collected` is never `pass`. Replay does not retroactively
     * adjudicate what the collector of the day threw away.
     */
    it('reads not-collected on a stored bundle that recorded the chain as an error', () => {
      const stored = networkEvidence(
        [sourcePage(), targetPage('ru')],
        [
          makeProbe({
            id: 'probe-uk',
            url: UK_PRODUCT,
            acceptLanguage: null,
            outcome: 'error',
            status: 0,
            redirectChain: longChain(DEAD_END),
          }),
        ],
      );
      const result = resultFor(RULE, stored, CORE_RULESET);

      expect(result.verdict).toBe('not-collected');
      expect(result.missingCapabilities).toEqual(['http']);
      expect(result.findings).toEqual([]);
    });
  });

  it('defers to core/lang-missing when the page declares no language', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: null, alternates: [ukAlternate(UK_PRODUCT)] }),
    });
    const evidence = networkEvidence(
      [page, targetPage('uk')],
      [makeProbe({ id: 'probe-uk', url: UK_PRODUCT, acceptLanguage: null })],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-missing/);
  });

  it('is not applicable when the page carries neither a url nor a build path', () => {
    // `exactOptionalPropertyTypes` forbids `url: undefined`; drop the key
    // entirely — makePage's own default would otherwise supply one.
    const { url: _url, ...page } = makePage({
      id: 'page-ru',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(UK_PRODUCT)] }),
    });
    const evidence = networkEvidence(
      [page, targetPage('uk')],
      [makeProbe({ id: 'probe-uk', url: UK_PRODUCT, acceptLanguage: null })],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/neither a URL nor a build path/);
  });

  it('does not treat a bare-fragment href as a followable switch target', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('#')] }),
    });
    const evidence = networkEvidence(
      [page, targetPage('uk')],
      [makeProbe({ id: 'probe-uk', url: UK_PRODUCT, acceptLanguage: null })],
    );
    const result = resultFor(RULE, evidence);
    // The declared href is just an anchor — nothing was ever fetched for it.
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no probe followed a target/);
  });

  it('does not treat a landing page with no language marker of its own as a bounce', () => {
    const chain: readonly RedirectHop[] = [
      { url: UK_PRODUCT, status: 302, location: `${SHOP}/help` },
    ];
    expect(resultFor(RULE, bounceEvidence(chain)).verdict).toBe('pass');
  });

  it('does not crash on a malformed Location header, and does not call it a bounce', () => {
    const chain: readonly RedirectHop[] = [
      { url: UK_PRODUCT, status: 301, location: 'https://exa mple.com/uk/' },
    ];
    expect(resultFor(RULE, bounceEvidence(chain)).verdict).toBe('pass');
  });

  it('cites no node when the bouncing target carries no node path (a sitemap-only declaration)', () => {
    const sitemapAlternate: AlternateLink = {
      hreflang: 'uk-ua',
      href: UK_PRODUCT,
      source: 'sitemap',
    };
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [sitemapAlternate] }),
    });
    const evidence = networkEvidence(
      [page, targetPage('ru')],
      [
        makeProbe({
          id: 'probe-uk',
          url: UK_PRODUCT,
          acceptLanguage: null,
          redirectChain: BOUNCE_CHAIN,
        }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.subject.node).toBeUndefined();
  });
});

describe('core/switch-loses-path', () => {
  const RULE = 'core/switch-loses-path';

  it('fails when switching from a product page lands on the homepage', () => {
    const evidence = networkEvidence([sourcePage(UK_HOME), targetPage('uk', UK_HOME)]);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(
      /Switching to uk from \/ru\/drill lands on \/uk, the site root/,
    );
  });

  it('passes when the switch keeps the path', () => {
    const evidence = networkEvidence([sourcePage(), targetPage('uk')]);
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('cites no node when the target that lost its path carries no node path', () => {
    const sitemapAlternate: AlternateLink = { hreflang: 'uk-ua', href: UK_HOME, source: 'sitemap' };
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [sitemapAlternate] }),
    });
    const evidence = networkEvidence([page, targetPage('uk', UK_HOME)]);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.subject.node).toBeUndefined();
  });

  it('is not applicable when the switch starts from the site root', () => {
    const root = makePage({
      id: 'page-ru',
      url: `${SHOP}/ru/`,
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(UK_HOME)] }),
    });
    const result = resultFor(RULE, networkEvidence([root, targetPage('uk', UK_HOME)]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/is the site root/);
  });

  it('recognizes a bare domain root with no language prefix as the site root too', () => {
    const root = makePage({
      id: 'page-ru',
      url: `${SHOP}/`,
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(UK_HOME)] }),
    });
    const result = resultFor(RULE, networkEvidence([root, targetPage('uk', UK_HOME)]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/is the site root/);
  });

  it('fails a build whose document-relative target climbs out to the homepage', () => {
    const source = makeBuildPage({
      id: 'page-ru',
      path: 'ru/drill/index.html',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('../../uk/')] }),
    });
    const home = makeBuildPage({
      id: 'page-uk',
      path: 'uk/index.html',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const result = resultFor(RULE, filesystemEvidence([source, home]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(
      /Switching to uk from \/ru\/drill lands on \/uk, the site root/,
    );
  });

  it('passes a build whose document-relative target keeps its path', () => {
    // The pass this rule owes a correct site. Off disk the target resolved to
    // nothing and the rule read `not-applicable` — never a `fail`, but never
    // an answer either, on a switch that does exactly what it should.
    const source = makeBuildPage({
      id: 'page-ru',
      path: 'ru/drill/index.html',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('../../uk/drill/')] }),
    });
    const target = makeBuildPage({
      id: 'page-uk',
      path: 'uk/drill/index.html',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    expect(resultFor(RULE, filesystemEvidence([source, target])).verdict).toBe('pass');
  });
});

describe('core/switch-requires-script', () => {
  const RULE = 'core/switch-requires-script';

  it('reports an info finding, never a pass, for a script-only switcher', () => {
    const evidence = renderedPicker([pickerOption('RU', null, true), pickerOption('UA', null)]);
    const result = resultFor(RULE, evidence);
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/core\/picker-no-navigable-target/);
    expect(result.findings[0]?.summary).toMatch(/unreachable to search engines/);
    // Info findings are cited, never scored — confirming a click never becomes a pass.
    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(1);
  });

  it('is not applicable when every entry already exposes a URL', () => {
    const evidence = renderedPicker([
      pickerOption('RU', RU_PRODUCT, true),
      pickerOption('UA', UK_PRODUCT),
    ]);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no script is needed/);
  });

  it('is not-collected without a rendered tier, never pass', () => {
    const result = resultFor(RULE, networkEvidence([sourcePage(), targetPage('uk')]));
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['browser']);
  });

  it('is not applicable for a rendered page with no language picker at all', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      rendered: true,
      document: makeDocument({ htmlLang: 'ru', picker: null }),
    });
    const result = resultFor(RULE, networkEvidence([page]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no language picker/);
  });

  it('is not applicable for a static-tier page even when another page in the run was rendered', () => {
    const rendered = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      rendered: true,
      document: makeDocument({
        htmlLang: 'ru',
        picker: makePicker({
          kind: 'select',
          activeLabel: 'RU',
          options: [pickerOption('UA', null)],
        }),
      }),
    });
    // A second, static-tier page in the same run — the 'browser' capability is
    // run-wide, but this specific page's own digest never went through a DOM.
    const static_ = makePage({
      id: 'page-de',
      url: `${SHOP}/de/drill`,
      rendered: false,
      document: makeDocument({
        htmlLang: 'de',
        picker: makePicker({
          kind: 'select',
          activeLabel: 'DE',
          options: [pickerOption('FR', null)],
        }),
      }),
    });
    const result = resultFor(RULE, networkEvidence([rendered, static_]));
    // The rendered page still produces its info finding; the static one contributes nothing.
    expect(result.verdict).toBe('pass');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject.url).toBe(RU_PRODUCT);
  });
});
