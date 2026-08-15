import { describe, expect, it } from 'vitest';
import type { Classifier } from '../classifier';
import { evaluate } from '../evaluate';
import type {
  AlternateLink,
  Evidence,
  PageEvidence,
  PickerOption,
  RedirectHop,
  TextNodeSample,
  TextSampling,
} from '../evidence';
import type { RuleResult } from '../report';
import type { Ruleset } from '../ruleset';
import { createRuleset } from '../ruleset';
import { switchFamily } from './switch';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makePicker,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';

function rulesetWith(classifier?: Classifier): Ruleset {
  return createRuleset({
    id: 'test/switch',
    version: '0.0.0-test',
    families: [switchFamily],
    ...(classifier === undefined ? {} : { classifier }),
  });
}

const RULESET = rulesetWith();

/** A classifier that never has a confident answer for anything. */
const neverClassifies: Classifier = () => null;

/** The classifier seam, stubbed: no franc, no trigram tables, no surprises. */
function alwaysClassifies(language: string): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

function resultFor(ruleId: string, evidence: Evidence, ruleset: Ruleset = RULESET): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

const SHOP = 'https://shop.example';
const RU_PRODUCT = `${SHOP}/ru/drill`;
const UK_PRODUCT = `${SHOP}/uk/drill`;
const UK_HOME = `${SHOP}/uk/`;
const ALTERNATE_NODE = 'head > link[hreflang="uk-ua"]';

/** The `uk-ua` alternate a UA shop publishes — the one that so often bounces. */
function ukAlternate(href: string): AlternateLink {
  return { hreflang: 'uk-ua', href, source: 'link', nodePath: ALTERNATE_NODE };
}

const SAMPLES: readonly TextNodeSample[] = [
  { nodePath: 'main > h1', text: 'Дрель ударная', inheritedLang: null },
  { nodePath: 'main > p', text: 'Доставка по всей стране', inheritedLang: null },
];

/** The Russian product page: where the visitor tries to switch away from. */
function sourcePage(href = UK_PRODUCT, url = RU_PRODUCT): PageEvidence {
  return makePage({
    id: 'page-ru',
    url,
    document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(href)] }),
  });
}

/** The declared Ukrainian target, as the collector actually found it. */
function targetPage(
  htmlLang: string | null,
  url = UK_PRODUCT,
  textNodes: readonly TextNodeSample[] = [],
  textSampling?: TextSampling,
): PageEvidence {
  return makePage({
    id: 'page-uk',
    url,
    reach: 'declared-target',
    document: makeDocument({
      htmlLang,
      textNodes,
      ...(textSampling === undefined ? {} : { textSampling }),
    }),
  });
}

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

function pickerOption(label: string, href: string | null, active = false): PickerOption {
  return { label, href, active, nodePath: `body > nav > ul.lang > li.${label}` };
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

describe('the family', () => {
  it('ships the four switch rules in catalogue order', () => {
    expect(switchFamily.rules.map((rule) => rule.id)).toEqual([
      'core/switch-no-effect',
      'core/switch-bounces',
      'core/switch-loses-path',
      'core/switch-requires-script',
    ]);
  });

  it('declares the capabilities the catalogue lists, with the alternation resolved', () => {
    expect(
      Object.fromEntries(switchFamily.rules.map((rule) => [rule.id, rule.capabilities])),
    ).toEqual({
      // "static | traversal" is an alternation, and filesystem evidence grants
      // traversal for free — so `traversal` alone is what the row means.
      'core/switch-no-effect': ['traversal'],
      // "http + traversal" is a genuine AND: a filesystem has no redirects.
      'core/switch-bounces': ['http', 'traversal'],
      'core/switch-loses-path': ['traversal'],
      'core/switch-requires-script': ['browser'],
    });
  });

  it('marks only the rule the catalogue calls hybrid', () => {
    const hybrids = switchFamily.rules.filter((rule) => rule.hybrid === true);
    expect(hybrids.map((rule) => rule.id)).toEqual(['core/switch-no-effect']);
  });

  it('grounds the redirect rule in HTTP and the rest in the site’s declarations', () => {
    expect(Object.fromEntries(switchFamily.rules.map((rule) => [rule.id, rule.grounding]))).toEqual(
      {
        'core/switch-no-effect': 'declared',
        'core/switch-bounces': 'observed',
        'core/switch-loses-path': 'declared',
        'core/switch-requires-script': 'declared',
      },
    );
  });
});

describe('core/switch-no-effect', () => {
  const RULE = 'core/switch-no-effect';

  it('fails when the declared target serves the source language again', () => {
    const result = resultFor(RULE, networkEvidence([sourcePage(), targetPage('ru')]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.via).toBe('declared');
    expect(result.findings[0]?.summary).toMatch(/does not change the language/);
    expect(result.findings[0]?.subject.node).toBe(ALTERNATE_NODE);
  });

  it('passes when the target actually serves the language it declares', () => {
    expect(resultFor(RULE, networkEvidence([sourcePage(), targetPage('uk')])).verdict).toBe('pass');
  });

  it('loses its failing power when the classifier answered instead of the markup', () => {
    const evidence = networkEvidence([sourcePage(), targetPage(null, UK_PRODUCT, SAMPLES)]);
    const result = resultFor(RULE, evidence, rulesetWith(alwaysClassifies('ru')));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.denominator).toEqual({ examined: 2, matched: 2 });
    expect(finding?.summary).toMatch(/2 of 2 text nodes classify as ru/);
    expect(result.verdict).toBe('pass');
  });

  /**
   * The collector caps body sampling, so the target's `textNodes` is a floor
   * and never a census. Quoting the floor understates the denominator and
   * thereby **inflates** the share this finding publishes about the site it
   * names — 2 of 900 is a footnote, 2 of 2 is an accusation. The summary must
   * quote the same number the denominator does.
   */
  it('measures a truncated sample against what was examined, not what survived', () => {
    const target = targetPage(null, UK_PRODUCT, SAMPLES, {
      examined: 900,
      sampled: 2,
      cappedAt: 2,
    });
    const result = resultFor(
      RULE,
      networkEvidence([sourcePage(), target]),
      rulesetWith(alwaysClassifies('ru')),
    );
    const finding = result.findings[0];
    expect(finding?.denominator).toEqual({ examined: 900, matched: 2 });
    expect(finding?.summary).toMatch(/2 of 900 text nodes classify as ru/);
    expect(finding?.summary).not.toMatch(/2 of 2 /);
  });

  it('never fires on a self-referential alternate — that is correct markup', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({
        htmlLang: 'ru',
        alternates: [{ hreflang: 'ru', href: RU_PRODUCT, source: 'link' }],
      }),
    });
    const result = resultFor(RULE, networkEvidence([page, targetPage('ru')]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no target in another language/);
  });

  it('defers to core/lang-missing when the page declares no language', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: null, alternates: [ukAlternate(UK_PRODUCT)] }),
    });
    const result = resultFor(RULE, networkEvidence([page, targetPage('ru')]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-missing/);
  });

  it('resolves and follows a switch target on a filesystem build, citing its build path', () => {
    const source = makeBuildPage({
      id: 'page-ru',
      path: 'ru/drill/index.html',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('/uk/drill/')] }),
    });
    const target = makeBuildPage({
      id: 'page-uk',
      path: 'uk/drill/index.html',
      document: makeDocument({ htmlLang: 'ru' }), // still serves ru: the switch is broken
    });
    const result = resultFor(RULE, filesystemEvidence([source, target]));
    expect(result.verdict).toBe('fail');
    // No url on a build page — the raw build path is cited instead.
    expect(result.findings[0]?.subject).toEqual({
      path: 'ru/drill/index.html',
      node: ALTERNATE_NODE,
    });
  });

  it('treats a blank <html lang> the same as a missing one', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: '   ', alternates: [ukAlternate(UK_PRODUCT)] }),
    });
    const result = resultFor(RULE, networkEvidence([page, targetPage('ru')]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/core\/lang-missing/);
  });

  it('ignores an x-default alternate — it is a routing fallback, not a switch target', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({
        htmlLang: 'ru',
        alternates: [
          ukAlternate(UK_PRODUCT),
          { hreflang: 'x-default', href: `${SHOP}/`, source: 'link' },
        ],
      }),
    });
    // The x-default target resolves to nothing collected; if it were treated as
    // a real switch target this would break instead of passing on the real one.
    const result = resultFor(RULE, networkEvidence([page, targetPage('uk')]));
    expect(result.verdict).toBe('pass');
  });

  it('reads switch targets from the picker too, not just hreflang alternates', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({
        htmlLang: 'ru',
        alternates: [],
        picker: makePicker({
          options: [
            pickerOption('RU', RU_PRODUCT, true), // the active entry — skipped
            pickerOption('UA', null), // no href — skipped
            {
              label: 'Currency',
              href: `${SHOP}/currency`,
              active: false,
              nodePath: 'body > nav > ul.lang > li.currency',
            }, // not a language — skipped
            pickerOption('UA', UK_PRODUCT), // the real switch target
          ],
        }),
      }),
    });
    const result = resultFor(RULE, networkEvidence([page, targetPage('ru', UK_PRODUCT)]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/picker entry/);
  });

  it('skips a declared target the audit never collected, without treating the page as unresolved', () => {
    const deTarget: AlternateLink = { hreflang: 'de', href: `${SHOP}/de/drill`, source: 'link' };
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(UK_PRODUCT), deTarget] }),
    });
    // Only the uk target was actually collected; the de target was declared but never fetched.
    const result = resultFor(RULE, networkEvidence([page, targetPage('uk')]));
    expect(result.verdict).toBe('pass');
  });

  it('does not accuse a switch of failing when the target has no text to classify', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(UK_PRODUCT)] }),
    });
    // The target resolves and declares no language of its own, and the
    // collector sampled no text at all — there is nothing to classify.
    const evidence = networkEvidence([page, targetPage(null, UK_PRODUCT, [])]);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('pass');
  });

  it('cites no node when the declared target carries no node path (a sitemap-only declaration)', () => {
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
    // The target still serves ru — a broken switch — but the alternate came
    // from the sitemap, not the DOM, so there is no node to point at.
    const result = resultFor(RULE, networkEvidence([page, targetPage('ru')]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.subject.node).toBeUndefined();
    expect(result.findings[0]?.evidence).toEqual([
      { kind: 'page', pageId: 'page-ru' },
      { kind: 'page', pageId: 'page-uk' },
    ]);
  });

  it('is not applicable when no declared target resolved to a collected page', () => {
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({
        htmlLang: 'ru',
        alternates: [ukAlternate(`${SHOP}/uk/never-collected`)],
      }),
    });
    // An unrelated declared-target page keeps `traversal` in the capability
    // set, so the rule actually runs instead of reporting not-collected.
    const evidence = networkEvidence([page, targetPage('uk', `${SHOP}/uk/other`)]);
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no declared target resolved/);
  });

  it('never asks the classifier to rubber-stamp a single-candidate guess', () => {
    const svTarget: AlternateLink = { hreflang: 'sv', href: `${SHOP}/sv/drill`, source: 'link' };
    const page = makePage({
      id: 'page-ru',
      url: RU_PRODUCT,
      document: makeDocument({ htmlLang: 'ru', alternates: [svTarget] }),
    });
    const target = makePage({
      id: 'page-sv',
      url: `${SHOP}/sv/drill`,
      reach: 'declared-target',
      document: makeDocument({ htmlLang: null, textNodes: SAMPLES }),
    });
    // Movar has no classifier profile for Swedish, so the candidate pool never
    // grows past 'ru' — a single candidate cannot be adjudicated by the classifier.
    const result = resultFor(RULE, networkEvidence([page, target]));
    expect(result.verdict).toBe('pass');
  });

  it('breaks a classifier tie by keeping the first language seen, not the last', () => {
    const tieBreakClassifier: Classifier = (text) => {
      if (text === SAMPLES[0]?.text)
        return { language: 'ru', margin: 1, rung: 1, discriminating: true };
      if (text === SAMPLES[1]?.text)
        return { language: 'uk', margin: 1, rung: 1, discriminating: true };
      return null;
    };
    const evidence = networkEvidence([sourcePage(), targetPage(null, UK_PRODUCT, SAMPLES)]);
    const result = resultFor(RULE, evidence, rulesetWith(tieBreakClassifier));
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    // ru and uk each classified once — a genuine tie — and the first one seen
    // (ru) wins, which equals the source language: the switch has no effect.
    expect(finding?.summary).toMatch(/classify as ru/);
  });

  it('does not accuse a switch of failing when the classifier has no confident answer for the target text', () => {
    const evidence = networkEvidence([sourcePage(), targetPage(null, UK_PRODUCT, SAMPLES)]);
    const result = resultFor(RULE, evidence, rulesetWith(neverClassifies));
    expect(result.verdict).toBe('pass');
  });
});

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
