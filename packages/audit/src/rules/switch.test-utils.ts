import type { Classifier } from '../classifier';
import { evaluate } from '../evaluate';
import type {
  AlternateLink,
  DocumentEvidence,
  Evidence,
  PageEvidence,
  PickerOption,
  TextNodeSample,
} from '../evidence';
import type { RuleResult } from '../report';
import type { Ruleset } from '../ruleset';
import { createRuleset } from '../ruleset';
import { switchFamily } from './switch';
import { makeDocument, makePage } from '../../test/fixtures';

export function rulesetWith(classifier?: Classifier): Ruleset {
  return createRuleset({
    id: 'test/switch',
    version: '0.0.0-test',
    families: [switchFamily],
    ...(classifier === undefined ? {} : { classifier }),
  });
}

const RULESET = rulesetWith();

export function resultFor(
  ruleId: string,
  evidence: Evidence,
  ruleset: Ruleset = RULESET,
): RuleResult {
  const result = evaluate(evidence, ruleset).results.find((entry) => entry.rule === ruleId);
  if (result === undefined) throw new Error(`no result for ${ruleId}`);
  return result;
}

export const SHOP = 'https://shop.example';

export const RU_PRODUCT = `${SHOP}/ru/drill`;

export const UK_PRODUCT = `${SHOP}/uk/drill`;

export const ALTERNATE_NODE = 'head > link[hreflang="uk-ua"]';

/** The `uk-ua` alternate a UA shop publishes — the one that so often bounces. */
export function ukAlternate(href: string): AlternateLink {
  return { hreflang: 'uk-ua', href, source: 'link', nodePath: ALTERNATE_NODE };
}

/** The Russian product page: where the visitor tries to switch away from. */
export function sourcePage(href = UK_PRODUCT, url = RU_PRODUCT): PageEvidence {
  return makePage({
    id: 'page-ru',
    url,
    document: makeDocument({ htmlLang: 'ru', alternates: [ukAlternate(href)] }),
  });
}

/** The declared Ukrainian target, as the collector actually found it. */
export function targetPage(
  htmlLang: string | null,
  url = UK_PRODUCT,
  textNodes: readonly TextNodeSample[] = [],
  textSampling?: DocumentEvidence['textSampling'],
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

export function pickerOption(label: string, href: string | null, active = false): PickerOption {
  return { label, href, active, nodePath: `body > nav > ul.lang > li.${label}` };
}
