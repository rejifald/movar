import { describe, expect, it } from 'vitest';
import type { Classifier } from '../classifier';
import { evaluate } from '../evaluate';
import type {
  AlternateLink,
  DocumentEvidence,
  Evidence,
  PageEvidence,
  ProbeEvidence,
  TextNodeSample,
  Vantage,
} from '../evidence';
import type { RuleResult } from '../report';
import type { Ruleset } from '../ruleset';
import { createRuleset } from '../ruleset';
import { servingFamily } from './serving';
import {
  CLAIMED_DE_VANTAGE,
  LOCAL_VANTAGE,
  VERIFIED_UA_VANTAGE,
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';

function rulesetWith(classifier?: Classifier): Ruleset {
  return createRuleset({
    id: 'test/serving',
    version: '0.0.0-test',
    families: [servingFamily],
    ...(classifier === undefined ? {} : { classifier }),
  });
}

const RULESET = rulesetWith();

/** The classifier seam, stubbed: no franc, no trigram tables, no surprises. */
function alwaysClassifies(language: string): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

/** A classifier that never has a confident answer for anything. */
const neverClassifies: Classifier = () => null;

function resultFor(ruleId: string, evidence: Evidence, ruleset: Ruleset = RULESET): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

/** The site declares Ukrainian and Russian — a two-language inventory. */
const ALTERNATES: readonly AlternateLink[] = [
  { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' },
  { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
];

/**
 * Two passages that clear the shared gates in `text-samples.ts` — over the
 * 40-character floor, not runs of proper nouns, not inside `<code>`. The
 * served-language seam classifies nothing else, so a fixture below the floor
 * would make every hybrid case here vacuous rather than assert anything.
 */
const SAMPLES: readonly TextNodeSample[] = [
  {
    nodePath: 'main > p:nth-child(1)',
    text: 'Кошик порожній — додайте товари, щоб оформити замовлення',
    inheritedLang: null,
  },
  {
    nodePath: 'main > p:nth-child(2)',
    text: 'Доставка по Україні за два робочі дні, оплата при отриманні',
    inheritedLang: null,
  },
];

/** Passages the shared gates exclude: below the floor, and inside `<code>`. */
const UNCLASSIFIABLE_SAMPLES: readonly TextNodeSample[] = [
  { nodePath: 'main > p:nth-child(1)', text: 'Ні', inheritedLang: null },
  { nodePath: 'main > p:nth-child(2)', text: 'Це', inheritedLang: null },
  {
    nodePath: 'main > pre > code',
    text: 'Доставка по Україні за два робочі дні, оплата при отриманні',
    inheritedLang: null,
  },
];

/** One response, digested as the page a probe produced. */
function response(
  id: string,
  htmlLang: string | null,
  textNodes: readonly TextNodeSample[] = [],
  textSampling?: DocumentEvidence['textSampling'],
): PageEvidence {
  return makePage({
    id,
    document: makeDocument({
      htmlLang,
      alternates: ALTERNATES,
      textNodes,
      ...(textSampling === undefined ? {} : { textSampling }),
    }),
  });
}

function probeFor(
  id: string,
  acceptLanguage: string | null,
  pageId: string,
  overrides: Partial<ProbeEvidence> = {},
): ProbeEvidence {
  return makeProbe({ id, acceptLanguage, pageId, ...overrides });
}

/** uk asked and uk served; ru asked and uk served again. The partial-honour shape. */
function partiallyHonoured(
  htmlLang: string | null,
  samples: readonly TextNodeSample[],
  textSampling?: DocumentEvidence['textSampling'],
): Evidence {
  return networkEvidence(
    [
      response('page-uk', htmlLang, samples, textSampling),
      response('page-ru', htmlLang, samples, textSampling),
    ],
    [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
  );
}

/** One URL, one header, two vantages — everything the geo check holds identical. */
function fromTwoVantages(uaLang: string, deLang: string): Evidence {
  return networkEvidence(
    [response('page-ua', uaLang), response('page-de', deLang)],
    [
      probeFor('probe-ua', 'uk', 'page-ua', { vantage: VERIFIED_UA_VANTAGE }),
      probeFor('probe-de', 'uk', 'page-de', { vantage: CLAIMED_DE_VANTAGE }),
    ],
  );
}

/** A third claimed vantage, so a leg can be wider than the pair a finding cites. */
const CLAIMED_PL_VANTAGE: Vantage = {
  id: 'warsaw-proxy',
  kind: 'proxy',
  country: { claimed: 'PL' },
};

/**
 * One URL, one absent header, three vantages. The Node collector is
 * single-vantage today, but `Evidence` is the public API and a merged or
 * third-party bundle can carry three vantages now.
 */
function fromThreeVantages(kyivLang: string, berlinLang: string, warsawLang: string): Evidence {
  return networkEvidence(
    [
      response('page-ua', kyivLang),
      response('page-de', berlinLang),
      response('page-pl', warsawLang),
    ],
    [
      probeFor('probe-ua', null, 'page-ua', { vantage: VERIFIED_UA_VANTAGE }),
      probeFor('probe-de', null, 'page-de', { vantage: CLAIMED_DE_VANTAGE }),
      probeFor('probe-pl', null, 'page-pl', { vantage: CLAIMED_PL_VANTAGE }),
    ],
  );
}

/** Every `<html lang="…">` a summary quotes, in the order it quotes them. */
function quotedDeclarations(summary: string): readonly string[] {
  return summary.match(/<html lang="[^"]*">/g) ?? [];
}

describe('the family', () => {
  it('ships the seven serving rules in catalogue order', () => {
    expect(servingFamily.rules.map((rule) => rule.id)).toEqual([
      'core/serving-default-language',
      'core/serving-header-ignored',
      'core/serving-header-partial',
      'core/serving-declared-never-served',
      'core/serving-vary-missing',
      'core/serving-decided-by-ip',
      'core/serving-cookie-overrides-header',
    ]);
  });

  it('is entirely observed-grounded — the witness is an HTTP fact', () => {
    for (const rule of servingFamily.rules) {
      expect(rule.grounding).toBe('observed');
      expect(rule.scope).toBe('site');
    }
  });

  it('declares the capabilities the catalogue lists, verbatim', () => {
    expect(
      Object.fromEntries(servingFamily.rules.map((rule) => [rule.id, rule.capabilities])),
    ).toEqual({
      'core/serving-default-language': ['http'],
      'core/serving-header-ignored': ['matrix'],
      'core/serving-header-partial': ['matrix'],
      'core/serving-declared-never-served': ['matrix'],
      'core/serving-vary-missing': ['matrix'],
      'core/serving-decided-by-ip': ['multi-vantage'],
      'core/serving-cookie-overrides-header': ['matrix'],
    });
  });

  it('marks exactly the two rules the catalogue calls hybrid', () => {
    const hybrids = servingFamily.rules.filter((rule) => rule.hybrid === true);
    expect(hybrids.map((rule) => rule.id)).toEqual([
      'core/serving-header-partial',
      'core/serving-declared-never-served',
    ]);
  });

  it('cannot run on static evidence at all, and says so rather than passing', () => {
    const report = evaluate(filesystemEvidence([makeBuildPage()]), RULESET);
    expect(report.coverage.notCollected).toBe(servingFamily.rules.length);
    expect(report.coverage.passed).toBe(0);
  });
});

describe('core/serving-default-language', () => {
  const RULE = 'core/serving-default-language';

  it('reports what the no-preference leg declared', () => {
    const evidence = networkEvidence(
      [response('page-default', 'ru')],
      [probeFor('probe-default', null, 'page-default')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.findings[0]?.verdict).toBe('info');
    expect(result.findings[0]?.summary).toMatch(/With no Accept-Language stated/);
    expect(result.findings[0]?.summary).toMatch(/<html lang="ru"> \(ru\)/);
    // An info finding is cited, never scored.
    expect(result.verdict).toBe('pass');
  });

  it('says so when the default response declares no language of its own', () => {
    const evidence = networkEvidence(
      [response('page-default', null)],
      [probeFor('probe-default', null, 'page-default')],
    );
    expect(resultFor(RULE, evidence).findings[0]?.summary).toMatch(/declares no page language/);
  });

  it('is not applicable when every probe stated a preference', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk')],
      [probeFor('probe-uk', 'uk', 'page-uk')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no no-preference leg/);
  });

  it('treats a blank <html lang> the same as a missing one', () => {
    const evidence = networkEvidence(
      [response('page-default', '   ')],
      [probeFor('probe-default', null, 'page-default')],
    );
    expect(resultFor(RULE, evidence).findings[0]?.summary).toMatch(/declares no page language/);
  });

  it('treats a probe that never produced a page the same as one with no declared language', () => {
    // `exactOptionalPropertyTypes` forbids `pageId: undefined`; drop the key
    // entirely to model a probe the collector never associated with a page.
    const { pageId: _pageId, ...orphanProbe } = makeProbe({
      id: 'probe-orphan',
      acceptLanguage: null,
    });
    const evidence = networkEvidence(
      [response('page-default', 'uk')],
      [
        // The collector recorded this probe without ever associating a page with it.
        orphanProbe,
        // This one names a page id the run never actually collected.
        probeFor('probe-dangling', null, 'page-missing'),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.findings).toHaveLength(2);
    for (const finding of result.findings) {
      expect(finding.summary).toMatch(/declares no page language/);
      // No page was found for either probe, so no page is cited — only the probe.
      expect(finding.evidence).toHaveLength(1);
      expect(finding.evidence[0]?.kind).toBe('probe');
    }
  });
});

describe('core/serving-header-ignored', () => {
  const RULE = 'core/serving-header-ignored';

  it('fails on byte identity across the matrix, with no language determination at all', () => {
    const evidence = networkEvidence(
      [response('page-uk', null), response('page-ru', null)],
      [
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:same' }),
        probeFor('probe-ru', 'ru', 'page-ru', { bodyHash: 'sha256:same' }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/byte-identical response body for all 2 header/);
    expect(result.findings[0]?.summary).toMatch(/declares 2 languages \(uk, ru\)/);
    // Byte identity is grounded in bytes: no `via`, no denominator, no classifier.
    expect(result.findings[0]?.via).toBeUndefined();
    expect(result.findings[0]?.denominator).toBeUndefined();
  });

  it('passes when the bodies differ', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:uk' }),
        probeFor('probe-ru', 'ru', 'page-ru', { bodyHash: 'sha256:ru' }),
      ],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('is not applicable to a site that declares only one language', () => {
    const monolingual = makePage({ id: 'page-uk', document: makeDocument({ htmlLang: 'uk' }) });
    const evidence = networkEvidence(
      [monolingual],
      [
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:same' }),
        probeFor('probe-ru', 'ru', 'page-uk', { bodyHash: 'sha256:same' }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/fewer than two languages/);
  });

  it('is not applicable when the collector recorded no body hashes', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'uk')],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no response body hashes/);
  });

  it('is not-collected without a matrix, never pass', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk')],
      [probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:uk' })],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['matrix']);
  });

  it('fails on byte identity even when one leg member stated no preference at all', () => {
    const evidence = networkEvidence(
      [response('page-none', null), response('page-uk', null)],
      [
        probeFor('probe-none', null, 'page-none', { bodyHash: 'sha256:same' }),
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:same' }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    // A no-preference leg member is still one of the header values being compared.
    expect(result.findings[0]?.summary).toMatch(/no Accept-Language/);
    expect(result.findings[0]?.summary).toMatch(/Accept-Language: uk/);
  });
});

describe('core/serving-header-partial', () => {
  const RULE = 'core/serving-header-partial';

  it('fails when one declared language is honoured and another is not', () => {
    const result = resultFor(RULE, partiallyHonoured('uk', []));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.via).toBe('declared');
    expect(result.findings[0]?.summary).toMatch(/honoured for uk and ignored for ru/);
  });

  it('passes when every declared language asked for is served', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('loses its failing power when the classifier answered instead of the markup', () => {
    const result = resultFor(
      RULE,
      partiallyHonoured(null, SAMPLES),
      rulesetWith(alwaysClassifies('uk')),
    );
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.denominator).toEqual({ examined: 4, matched: 4 });
    expect(finding?.summary).toMatch(/read from sampled text/);
    // An observation is cited, never scored — so the rule itself does not fail.
    expect(result.verdict).toBe('pass');
  });

  /**
   * This family sums a denominator per response, so a floor at the served-
   * language seam does not stay one page's: two truncated responses read as
   * *"4 of 4"* — a unanimous verdict on the whole of both — where the walker
   * had examined 1400 nodes between them. Every page a finding cites compounds
   * the understatement, which is why the count comes from
   * `textNodeDenominator()` rather than from a literal at the seam.
   */
  it('sums what each response examined, not what each sample kept', () => {
    const result = resultFor(
      RULE,
      partiallyHonoured(null, SAMPLES, { examined: 700, sampled: 2, cappedAt: 2 }),
      rulesetWith(alwaysClassifies('uk')),
    );
    expect(result.findings[0]?.denominator).toEqual({ examined: 1400, matched: 4 });
  });

  it('is not applicable when no leg asked for two declared languages', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-de', 'uk')],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-de', 'de', 'page-de')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no partial split/);
  });

  it('excludes a probe that stated no preference from the honoured/ignored split', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'uk'), response('page-none', 'uk')],
      [
        probeFor('probe-uk', 'uk', 'page-uk'),
        probeFor('probe-ru', 'ru', 'page-ru'),
        probeFor('probe-none', null, 'page-none'),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    // The no-preference probe asked for nothing, so it cannot be "ignored" —
    // only uk (honoured) and ru (ignored) appear in the split.
    expect(result.findings[0]?.summary).toMatch(/honoured for uk and ignored for ru/);
  });

  it('never offers the classifier a declared language it has no profile for', () => {
    const capturedCandidates: string[] = [];
    const capturingClassifier: Classifier = (_text, candidates) => {
      capturedCandidates.push(...candidates);
      return { language: 'uk', margin: 4, rung: 1, discriminating: true };
    };
    const page = makePage({
      id: 'page-uk',
      document: makeDocument({
        htmlLang: null,
        // The site also declares Swedish — a language outside Movar's classifier roster.
        alternates: [
          ...ALTERNATES,
          { hreflang: 'sv', href: 'https://example.com.ua/sv/', source: 'link' },
        ],
        textNodes: SAMPLES,
      }),
    });
    const evidence = networkEvidence(
      [page, response('page-ru', 'uk', SAMPLES)],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
    );
    resultFor(RULE, evidence, rulesetWith(capturingClassifier));
    expect(capturedCandidates).not.toContain('sv');
  });

  it('never asks the classifier to rubber-stamp a single-candidate guess', () => {
    const singleLanguage: readonly AlternateLink[] = [
      { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' },
    ];
    const page = (id: string) =>
      makePage({
        id,
        document: makeDocument({ htmlLang: null, alternates: singleLanguage, textNodes: SAMPLES }),
      });
    const evidence = networkEvidence(
      [page('page-a'), page('page-b')],
      // Two different raw header values that both normalize to the one declared language.
      [probeFor('probe-a', 'uk', 'page-a'), probeFor('probe-b', 'uk-UA', 'page-b')],
    );
    const result = resultFor(RULE, evidence);
    // Only one language is declared, so there is nothing for the classifier to
    // discriminate between — a single-candidate pool cannot be adjudicated.
    expect(result.verdict).toBe('not-applicable');
  });

  it('breaks a classifier tie by keeping the first language seen, not the last', () => {
    const tieBreakClassifier: Classifier = (text) => {
      if (text === SAMPLES[0]?.text)
        return { language: 'uk', margin: 1, rung: 1, discriminating: true };
      if (text === SAMPLES[1]?.text)
        return { language: 'ru', margin: 1, rung: 1, discriminating: true };
      return null;
    };
    const result = resultFor(
      RULE,
      partiallyHonoured(null, SAMPLES),
      rulesetWith(tieBreakClassifier),
    );
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    // uk and ru each classified once — a genuine tie — and the first one seen wins.
    expect(finding?.summary).toMatch(/answered in uk/);
  });
});

describe('core/serving-declared-never-served', () => {
  const RULE = 'core/serving-declared-never-served';

  it('fails naming the declared language that never came back', () => {
    const result = resultFor(RULE, partiallyHonoured('uk', []));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.via).toBe('declared');
    expect(result.findings[0]?.summary).toMatch(/declares a ru version/);
    expect(result.findings[0]?.summary).toMatch(/never served ru under any header tested/);
  });

  it('passes when every declared language is served under its own header', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('loses its failing power when the classifier answered instead of the markup', () => {
    const result = resultFor(
      RULE,
      partiallyHonoured(null, SAMPLES),
      rulesetWith(alwaysClassifies('uk')),
    );
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.verdict).toBe('observation');
    expect(finding?.downgradedFrom).toBe('fail');
    expect(finding?.denominator?.examined).toBe(2);
    expect(result.verdict).toBe('pass');
  });

  it('is not applicable when no response language could be determined', () => {
    const evidence = networkEvidence(
      [response('page-uk', null), response('page-ru', null)],
      [probeFor('probe-uk', 'uk', 'page-uk'), probeFor('probe-ru', 'ru', 'page-ru')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/never served/);
  });

  it('is not applicable when the classifier has no confident answer for any sampled text', () => {
    const result = resultFor(RULE, partiallyHonoured(null, SAMPLES), rulesetWith(neverClassifies));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/never served/);
  });

  /**
   * The same silence, one gate earlier and for a different reason: here the
   * classifier is perfectly confident, and never gets asked. Family C used to
   * hand it raw `sample.text`, so two two-character words and a `<code>` block
   * produced a served-language determination and this rule published an
   * observation naming a site over text `text-samples.ts` refuses to classify
   * (#435). A confident stub is the point of the case — `neverClassifies`
   * above cannot tell "asked and abstained" from "never asked".
   */
  it('is not applicable when every sampled passage is excluded by the shared gates', () => {
    const result = resultFor(
      RULE,
      partiallyHonoured(null, UNCLASSIFIABLE_SAMPLES),
      rulesetWith(alwaysClassifies('uk')),
    );
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/never served/);
    expect(result.findings).toEqual([]);
  });

  it('excludes an unrequested response and an uncollected one from the never-served comparison', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk')],
      [
        probeFor('probe-uk', 'uk', 'page-uk'),
        // Stated no preference — not an "ask", so it cannot count toward "asked".
        probeFor('probe-none', null, 'page-uk'),
        // Asked for ru, but the collector never produced a page for it.
        probeFor('probe-ru', 'ru', 'page-missing'),
      ],
    );
    const result = resultFor(RULE, evidence);
    // ru was asked for but has no answered probe to cite as evidence, so it is
    // never accused — an accusation needs an answered request to point at.
    expect(result.verdict).toBe('pass');
  });
});

describe('core/serving-vary-missing', () => {
  const RULE = 'core/serving-vary-missing';

  it('fails a response that varies by header without saying so', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:uk' }),
        probeFor('probe-ru', 'ru', 'page-ru', { bodyHash: 'sha256:ru' }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/2 different response bodies/);
    expect(result.findings[0]?.summary).toMatch(/carried no Vary: Accept-Language/);
  });

  it('passes when Vary names the header, whatever the casing', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [
        probeFor('probe-uk', 'uk', 'page-uk', {
          bodyHash: 'sha256:uk',
          responseHeaders: { Vary: 'accept-language, cookie' },
        }),
        probeFor('probe-ru', 'ru', 'page-ru', {
          bodyHash: 'sha256:ru',
          // A real response carries other headers too — Vary need not be first.
          responseHeaders: { 'Content-Type': 'text/html', vary: 'Accept-Language' },
        }),
      ],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('recognizes Vary: * as covering Accept-Language too', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'ru')],
      [
        probeFor('probe-uk', 'uk', 'page-uk', {
          bodyHash: 'sha256:uk',
          responseHeaders: { Vary: '*' },
        }),
        probeFor('probe-ru', 'ru', 'page-ru', {
          bodyHash: 'sha256:ru',
          responseHeaders: { Vary: 'Accept-Language' },
        }),
      ],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('is not applicable when the body never changed', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk'), response('page-ru', 'uk')],
      [
        probeFor('probe-uk', 'uk', 'page-uk', { bodyHash: 'sha256:same' }),
        probeFor('probe-ru', 'ru', 'page-ru', { bodyHash: 'sha256:same' }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/not required/);
  });
});

describe('core/serving-decided-by-ip', () => {
  const RULE = 'core/serving-decided-by-ip';

  it('fails when identical headers get different languages per vantage', () => {
    const result = resultFor(RULE, fromTwoVantages('uk', 'de'));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/follows the network location/);
  });

  it('never presents a vantage country claim as an observed fact', () => {
    const summary = resultFor(RULE, fromTwoVantages('uk', 'de')).findings[0]?.summary ?? '';
    expect(summary).toMatch(/claims country DE, unverified/);
    expect(summary).toMatch(/egress country verified as UA/);
  });

  it('passes when both vantages get the same language', () => {
    expect(resultFor(RULE, fromTwoVantages('uk', 'uk')).verdict).toBe('pass');
  });

  it('is not-collected from a single vantage, never pass', () => {
    const evidence = networkEvidence(
      [response('page-uk', 'uk')],
      [probeFor('probe-uk', 'uk', 'page-uk')],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-collected');
    expect(result.missingCapabilities).toEqual(['multi-vantage']);
  });

  it('is not applicable when no comparable leg has a declared language on both sides, even with multiple vantages', () => {
    const evidence = networkEvidence(
      [response('page-ua', 'uk'), response('page-de', null)],
      [
        probeFor('probe-ua', 'uk', 'page-ua', { vantage: VERIFIED_UA_VANTAGE }),
        probeFor('probe-de', 'uk', 'page-de', { vantage: CLAIMED_DE_VANTAGE }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no URL was fetched from two vantages/);
  });

  it('excludes a repeated vantage and one with no collected page from the comparison', () => {
    const evidence = networkEvidence(
      [response('page-ua', 'uk'), response('page-de', 'de')],
      [
        probeFor('probe-ua-1', 'uk', 'page-ua', { vantage: VERIFIED_UA_VANTAGE }),
        // A retried probe from the same vantage — must not be double-counted.
        probeFor('probe-ua-2', 'uk', 'page-ua', { vantage: VERIFIED_UA_VANTAGE }),
        probeFor('probe-de', 'uk', 'page-de', { vantage: CLAIMED_DE_VANTAGE }),
        // A third vantage whose probe never got a page of its own.
        probeFor('probe-fr', 'uk', 'page-missing', {
          vantage: { id: 'paris-proxy', kind: 'proxy' },
        }),
      ],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('fail');
    expect(result.findings).toHaveLength(1);
    // Only the two vantages with a declared language on their own page are cited.
    expect(result.findings[0]?.evidence).toHaveLength(2);
  });

  it('describes a vantage with no country claim plainly, without inventing one', () => {
    const evidence = networkEvidence(
      [response('page-local', 'uk'), response('page-de', 'de')],
      [
        probeFor('probe-local', 'uk', 'page-local', { vantage: LOCAL_VANTAGE }),
        probeFor('probe-de', 'uk', 'page-de', { vantage: CLAIMED_DE_VANTAGE }),
      ],
    );
    const summary = resultFor(RULE, evidence).findings[0]?.summary ?? '';
    expect(summary).toMatch(/vantage "local" \(no country claimed\)/);
  });

  it('cites two vantages that actually differ, not the first two positionally', () => {
    // kyiv=uk, berlin=uk, warsaw=en. The difference is kyiv vs warsaw; a
    // finding built from the first two readings quotes uk twice and so shows
    // no difference at all — while failing the build over one.
    const result = resultFor(RULE, fromThreeVantages('uk', 'uk', 'en'));
    expect(result.verdict).toBe('fail');
    const summary = result.findings[0]?.summary ?? '';
    expect(quotedDeclarations(summary)).toEqual(['<html lang="uk">', '<html lang="en">']);
    expect(summary).toContain('vantage "kyiv-proxy" (egress country verified as UA)');
    expect(summary).toContain('vantage "warsaw-proxy" (claims country PL, unverified)');
    expect(summary).not.toContain('berlin-proxy');
  });

  it('keeps every reading in the evidence while citing only the differing pair', () => {
    const result = resultFor(RULE, fromThreeVantages('uk', 'uk', 'en'));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidence).toEqual([
      { kind: 'probe', probeId: 'probe-ua' },
      { kind: 'probe', probeId: 'probe-de' },
      { kind: 'probe', probeId: 'probe-pl' },
    ]);
  });

  it('does not cite a pair whose tags differ only below the language subtag', () => {
    // uk and uk-UA are one language, so that pair demonstrates nothing.
    const summary =
      resultFor(RULE, fromThreeVantages('uk', 'uk-UA', 'en')).findings[0]?.summary ?? '';
    expect(quotedDeclarations(summary)).toEqual(['<html lang="uk">', '<html lang="en">']);
  });

  it('passes when three vantages agree on language, across a subtag difference', () => {
    // uk, uk-UA, uk is one language three times, so no pair of the three
    // demonstrates anything — `differingPair` has to come back null over every
    // pair, not just the first one it looks at, or the rule accuses a site of
    // geo-routing it never did.
    expect(resultFor(RULE, fromThreeVantages('uk', 'uk-UA', 'uk')).verdict).toBe('pass');
  });
});

describe('core/serving-cookie-overrides-header', () => {
  const RULE = 'core/serving-cookie-overrides-header';

  const COLD_MATRIX: readonly ProbeEvidence[] = [
    probeFor('cold-uk', 'uk', 'page-cold-uk'),
    probeFor('cold-ru', 'ru', 'page-cold-ru'),
  ];
  const COLD_PAGES: readonly PageEvidence[] = [
    response('page-cold-uk', 'uk'),
    response('page-cold-ru', 'ru'),
  ];

  it('is not applicable on a cold run — never a fail', () => {
    const result = resultFor(RULE, networkEvidence(COLD_PAGES, COLD_MATRIX));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/every probe in this run was cold/);
  });

  it('warns when the warm leg drops a header the cold leg honoured', () => {
    const evidence = networkEvidence(
      [...COLD_PAGES, response('page-warm', 'ru')],
      [...COLD_MATRIX, probeFor('warm-uk', 'uk', 'page-warm', { cookieState: 'warm' })],
    );
    const result = resultFor(RULE, evidence);
    expect(result.verdict).toBe('warn');
    expect(result.findings[0]?.summary).toMatch(/a stored cookie is taking precedence/);
  });

  it('passes when the warm leg still honours the header', () => {
    const evidence = networkEvidence(
      [...COLD_PAGES, response('page-warm', 'uk')],
      [...COLD_MATRIX, probeFor('warm-uk', 'uk', 'page-warm', { cookieState: 'warm' })],
    );
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('cannot claim an override when the warm response declares no language of its own', () => {
    const evidence = networkEvidence(
      [...COLD_PAGES, response('page-warm', null)],
      [...COLD_MATRIX, probeFor('warm-uk', 'uk', 'page-warm', { cookieState: 'warm' })],
    );
    // A warm response with no declared language at all cannot be compared
    // against the cold leg — there's nothing to claim was overridden.
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });

  it('cannot claim an override when the stated preference is present but empty', () => {
    const evidence = networkEvidence(
      [...COLD_PAGES, response('page-cold-empty', 'uk'), response('page-warm-empty', 'uk')],
      [
        ...COLD_MATRIX, // keeps the matrix capability satisfied
        probeFor('cold-empty', '', 'page-cold-empty'),
        probeFor('warm-empty', '', 'page-warm-empty', { cookieState: 'warm' }),
      ],
    );
    // An Accept-Language header that is present but empty names no preference
    // the site can be held to, even though a cold/warm pair exists for it.
    expect(resultFor(RULE, evidence).verdict).toBe('pass');
  });
});
