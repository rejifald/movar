import type { Classifier } from '../classifier';
import { evaluate } from '../evaluate';
import type {
  AlternateLink,
  DocumentEvidence,
  Evidence,
  PageEvidence,
  ProbeEvidence,
  TextNodeSample,
} from '../evidence';
import type { RuleResult } from '../report';
import type { Ruleset } from '../ruleset';
import { createRuleset } from '../ruleset';
import { servingFamily } from './serving';
import { makeDocument, makePage, makeProbe, networkEvidence } from '../../test/fixtures';

export function rulesetWith(classifier?: Classifier): Ruleset {
  return createRuleset({
    id: 'test/serving',
    version: '0.0.0-test',
    families: [servingFamily],
    ...(classifier === undefined ? {} : { classifier }),
  });
}

export const RULESET = rulesetWith();

/** The classifier seam, stubbed: no franc, no trigram tables, no surprises. */
export function alwaysClassifies(language: string): Classifier {
  return () => ({ language, margin: 4, rung: 1, discriminating: true });
}

export function resultFor(
  ruleId: string,
  evidence: Evidence,
  ruleset: Ruleset = RULESET,
): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

/** The site declares Ukrainian and Russian — a two-language inventory. */
export const ALTERNATES: readonly AlternateLink[] = [
  { hreflang: 'uk', href: 'https://example.com.ua/uk/', source: 'link' },
  { hreflang: 'ru', href: 'https://example.com.ua/ru/', source: 'link' },
];

/**
 * Two passages that clear the shared gates in `text-samples.ts` — over the
 * 40-character floor, not runs of proper nouns, not inside `<code>`. The
 * served-language seam classifies nothing else, so a fixture below the floor
 * would make every hybrid case here vacuous rather than assert anything.
 */
export const SAMPLES: readonly TextNodeSample[] = [
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

/** One response, digested as the page a probe produced. */
export function response(
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

export function probeFor(
  id: string,
  acceptLanguage: string | null,
  pageId: string,
  overrides: Partial<ProbeEvidence> = {},
): ProbeEvidence {
  return makeProbe({ id, acceptLanguage, pageId, ...overrides });
}

/** uk asked and uk served; ru asked and uk served again. The partial-honour shape. */
export function partiallyHonoured(
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
