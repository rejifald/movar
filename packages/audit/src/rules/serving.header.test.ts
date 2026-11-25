import { describe, expect, it } from 'vitest';
import type { Classifier } from '../classifier';
import { evaluate } from '../evaluate';
import type { AlternateLink } from '../evidence';
import { servingFamily } from './serving';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makeProbe,
  networkEvidence,
} from '../../test/fixtures';
import {
  rulesetWith,
  RULESET,
  alwaysClassifies,
  resultFor,
  ALTERNATES,
  SAMPLES,
  response,
  probeFor,
  partiallyHonoured,
} from './serving.test-utils';

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
