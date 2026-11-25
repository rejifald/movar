import { describe, expect, it } from 'vitest';
import type { Classifier } from '../classifier';
import type { AlternateLink, TextNodeSample } from '../evidence';
import { switchFamily } from './switch';
import {
  filesystemEvidence,
  makeBuildPage,
  makeDocument,
  makePage,
  makePicker,
  networkEvidence,
} from '../../test/fixtures';
import {
  rulesetWith,
  resultFor,
  SHOP,
  RU_PRODUCT,
  UK_PRODUCT,
  ALTERNATE_NODE,
  ukAlternate,
  sourcePage,
  targetPage,
  pickerOption,
} from './switch.test-utils';

/** A classifier that never has a confident answer for anything. */
const neverClassifies: Classifier = () => null;

/** The classifier seam, stubbed: no franc, no trigram tables, no surprises. */
function alwaysClassifies(language: string): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

/**
 * Two passages that clear the shared gates in `text-samples.ts` — over the
 * 40-character floor, not runs of proper nouns, not inside `<code>`. The
 * served-language seam classifies nothing else, so a fixture below the floor
 * would leave every hybrid case here asserting an answer the kernel no longer
 * gives.
 */
const SAMPLES: readonly TextNodeSample[] = [
  {
    nodePath: 'main > h1',
    text: 'Дрель ударная с металлическим патроном и регулировкой оборотов',
    inheritedLang: null,
  },
  {
    nodePath: 'main > p',
    text: 'Доставка по всей стране за три рабочих дня, оплата при получении',
    inheritedLang: null,
  },
];

/** Passages the shared gates exclude: below the floor, and inside `<code>`. */
const UNCLASSIFIABLE_SAMPLES: readonly TextNodeSample[] = [
  { nodePath: 'main > h1', text: 'Ні', inheritedLang: null },
  { nodePath: 'main > p', text: 'Це', inheritedLang: null },
  {
    nodePath: 'main > pre > code',
    text: 'Доставка по всей стране за три рабочих дня, оплата при получении',
    inheritedLang: null,
  },
];

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
   * The collector caps text sampling, so on a truncated page the sample and the
   * population part company by the whole truncation. This finding names a site
   * and quotes a share; quoting it against the cap reads as "every node on the
   * page is Russian" when the measurement covered two of four thousand.
   */
  it('states the population the collector examined, not the truncated sample', () => {
    const target = targetPage(null, UK_PRODUCT, SAMPLES, {
      examined: 4000,
      sampled: 2,
      cappedAt: 2,
    });
    const result = resultFor(
      RULE,
      networkEvidence([sourcePage(), target]),
      rulesetWith(alwaysClassifies('ru')),
    );
    const finding = result.findings[0];
    expect(finding?.via).toBe('classified');
    expect(finding?.denominator).toEqual({ examined: 4000, matched: 2 });
    expect(finding?.summary).toMatch(/2 of 4000 text nodes classify as ru/);
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

  it('follows a document-relative target on a build, from the file that declared it', () => {
    // A build page carries a `path` and no `url`, so threading the url as the
    // base handed this alternate `undefined` and it fell back to the site
    // root. Nothing resolved, and the rule abstained on a switch that is
    // plainly broken: the declared Ukrainian version serves Russian again.
    const source = makeBuildPage({
      id: 'page-ru',
      path: 'ru/drill/index.html',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('../../uk/drill/')] }),
    });
    const target = makeBuildPage({
      id: 'page-uk',
      path: 'uk/drill/index.html',
      document: makeDocument({ htmlLang: 'ru' }),
    });
    const result = resultFor(RULE, filesystemEvidence([source, target]));
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.summary).toMatch(/does not change the language/);
  });

  it('abstains on a build when the relative target resolves to nothing collected', () => {
    // Resolving correctly is not resolving permissively: `../../uk/drill/`
    // does not name `/uk/`, and an unresolvable target is
    // core/hreflang-target-unresolvable's to report, not this rule's.
    const source = makeBuildPage({
      id: 'page-ru',
      path: 'ru/drill/index.html',
      document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate('../../uk/drill/')] }),
    });
    const home = makeBuildPage({
      id: 'page-uk',
      path: 'uk/index.html',
      document: makeDocument({ htmlLang: 'uk' }),
    });
    const result = resultFor(RULE, filesystemEvidence([source, home]));
    expect(result.verdict).toBe('not-applicable');
    expect(result.notApplicableReason).toMatch(/no declared target resolved/);
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

  /**
   * The same restraint one gate earlier, and the reason it matters more here
   * than anywhere else the served-language seam is read. This seam used to hand
   * the classifier raw `sample.text`, so a target whose only passages were two
   * two-character words and a `<code>` block came back with a confident
   * verdict — and the verdict decides the finding in *both* directions: equal
   * to the source it publishes an observation accusing a named site of a
   * switch that does nothing, and different from the source it suppresses a
   * draft that may have been real (#435). A confident stub is the point of the
   * case: `neverClassifies` above cannot tell "asked and abstained" from "never
   * asked".
   */
  it('never reads a verdict out of text the shared gates exclude', () => {
    const evidence = networkEvidence([
      sourcePage(),
      targetPage(null, UK_PRODUCT, UNCLASSIFIABLE_SAMPLES),
    ]);
    const result = resultFor(RULE, evidence, rulesetWith(alwaysClassifies('ru')));
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });
});
