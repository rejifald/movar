import { describe, expect, it } from 'vitest';
import type { Classifier } from '../classifier';
import type { Evidence, PageEvidence, ProbeEvidence, TextNodeSample, Vantage } from '../evidence';
import {
  CLAIMED_DE_VANTAGE,
  LOCAL_VANTAGE,
  VERIFIED_UA_VANTAGE,
  networkEvidence,
} from '../../test/fixtures';
import {
  rulesetWith,
  alwaysClassifies,
  resultFor,
  SAMPLES,
  response,
  probeFor,
  partiallyHonoured,
} from './serving.test-utils';

/** A classifier that never has a confident answer for anything. */
const neverClassifies: Classifier = () => null;

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

  /**
   * A run that asked for a warm leg and kept no warm probe is not a cold run,
   * and must not be described as one: the leg met a challenge interstitial,
   * failed in transport, or ran out of budget. Every probe the bundle *holds*
   * is cold either way, so `NetworkSource.cookies` is the only thing that can
   * tell the two apart — and calling this one cold hands the collector's
   * shortfall to the operator as their own choice.
   */
  it('says the warm leg produced nothing, rather than calling a warm run cold', () => {
    const result = resultFor(RULE, networkEvidence(COLD_PAGES, COLD_MATRIX, 'warm'));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/asked for a warm cookie leg/);
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
