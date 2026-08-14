/**
 * The **language inventory** — the union of the languages a site *declares*.
 *
 * Kernel rather than a rule family, because three families already ask the same
 * question and must not answer it differently: family B adjudicates the
 * inventory itself, family C needs "how many languages did the site promise?"
 * before it can call a byte-identical response a defect, and family F's
 * `ua/state-language-absent` turns on whether Ukrainian is declared anywhere.
 *
 * Two properties are load-bearing:
 *
 * 1. **Declared only, never inferred.** The union comes from hreflang
 *    alternates, `<link rel="alternate">`, sitemap alternates, picker options
 *    and `og:locale:alternate`. Probing `/uk/` or `uk.` to guess at an
 *    undeclared translation is
 *    forbidden — a false accusation is the one failure mode that kills this
 *    product, and a 200 on an SPA catch-all is not evidence of anything.
 *    `<html lang>` is deliberately **not** a source: it declares what *this*
 *    page is, not what the site offers.
 * 2. **Attribution is kept, not flattened.** Disagreement *between* the sources
 *    is itself the finding — hreflang declaring `{uk, ru, en}` while the picker
 *    offers `{ru, en}` is where most real-world defects live. A bare set of
 *    languages cannot express that, so {@link LanguageInventory} carries which
 *    source declared what.
 *
 * Normalization differs by source on purpose: `hreflang` is a documented BCP-47
 * attribute and goes through {@link declaredLanguageOf}, while a picker label is
 * free text (`Українська`, `UA`, `по-русски`) and goes through the strict
 * `normalizeLanguageCode`. Using the BCP-47 variant on free text would turn a
 * label like `ru-return-warranty` into a declared `ru`.
 *
 * @see ../../../docs/movar-audit-rules.md — family B
 * @see ../../../docs/glossary.md#language-inventory
 */

import type { AlternateLink, PageEvidence } from './evidence';
import { declaredLanguageOf } from './bcp47';
import { headDeclarationLanguages, headDeclarationsOf } from './head-declaration';
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

/** The `hreflang` value meaning "the fallback for unmatched locales". */
export const X_DEFAULT = 'x-default';

/**
 * Where a declaration came from. `AlternateLink.source` plus two models that
 * are not alternate links: the picker, and `og:locale:alternate`.
 *
 * `og:locale` itself is **not** here, by the same rule that excludes
 * `<html lang>`: it declares what *this* page is, not what the site offers.
 * Only the `:alternate` form is an offer.
 */
export type InventorySource = AlternateLink['source'] | 'picker' | 'og-locale';

/** Every source the catalogue's inventory rules compare against each other. */
export const INVENTORY_SOURCES: readonly InventorySource[] = [
  'link',
  'header',
  'sitemap',
  'picker',
  'og-locale',
];

/**
 * What a page or a site declares it offers.
 *
 * `languages` is the union; `bySource` is the same information un-flattened, so
 * `core/inventory-sources-disagree` can name which source is missing what.
 * Sources that declared nothing are absent from `bySource` — a site with no
 * picker must not read as a picker offering zero languages.
 */
export interface LanguageInventory {
  readonly languages: ReadonlySet<string>;
  readonly bySource: ReadonlyMap<InventorySource, ReadonlySet<string>>;
}

/**
 * The language an alternate declares, or `null` for `x-default` and blanks.
 *
 * `x-default` is a routing declaration, not a language — counting it as one
 * would inflate every inventory by a phantom entry.
 */
export function alternateLanguage(alternate: AlternateLink): string | null {
  const value = alternate.hreflang.trim();
  if (value === '' || value.toLowerCase() === X_DEFAULT) return null;
  return declaredLanguageOf(value);
}

/** The language a picker entry offers, as the site expressed it. */
export function pickerOptionLanguage(label: string): string | null {
  return normalizeLanguageCode(label.trim());
}

function addTo(bySource: Map<InventorySource, Set<string>>, key: InventorySource, value: string) {
  const languages = bySource.get(key) ?? new Set<string>();
  languages.add(value);
  bySource.set(key, languages);
}

/**
 * `og:locale:alternate`, the fourth declared source.
 *
 * A site advertising `uk_UA` to social scrapers while declaring no `uk`
 * hreflang is exactly the disagreement `core/inventory-sources-disagree` exists
 * to report, so the Open Graph alternates are a source here rather than a rule
 * of their own. `og:locale` itself is excluded — see {@link InventorySource}.
 */
function collectOgAlternates(page: PageEvidence, bySource: Map<InventorySource, Set<string>>) {
  for (const declaration of headDeclarationsOf(page, 'og-locale-alternate')) {
    for (const language of headDeclarationLanguages(declaration)) {
      addTo(bySource, 'og-locale', language);
    }
  }
}

function collectPicker(page: PageEvidence, bySource: Map<InventorySource, Set<string>>) {
  const { picker } = page.document;
  if (picker === null) return;
  for (const option of picker.options) {
    const language = pickerOptionLanguage(option.label);
    if (language !== null) addTo(bySource, 'picker', language);
  }
}

function collect(pages: readonly PageEvidence[]): Map<InventorySource, Set<string>> {
  const bySource = new Map<InventorySource, Set<string>>();
  for (const page of pages) {
    for (const alternate of page.document.alternates) {
      const language = alternateLanguage(alternate);
      if (language !== null) addTo(bySource, alternate.source, language);
    }
    collectOgAlternates(page, bySource);
    collectPicker(page, bySource);
  }
  return bySource;
}

function assemble(bySource: Map<InventorySource, Set<string>>): LanguageInventory {
  const languages = new Set<string>();
  for (const declared of bySource.values()) {
    for (const language of declared) languages.add(language);
  }
  return { languages, bySource };
}

/** What one page declares. The unit `core/inventory-varies-across-pages` compares. */
export function pageInventory(page: PageEvidence): LanguageInventory {
  return assemble(collect([page]));
}

/** What the whole collected page set declares, unioned. */
export function siteInventory(pages: readonly PageEvidence[]): LanguageInventory {
  return assemble(collect(pages));
}

/**
 * The inventory narrowed to codes the classifier ships a profile for.
 *
 * Only for rules that must ask "what language is this response?" — never for
 * reporting the inventory itself, which states what the site declared even when
 * Movar cannot classify it.
 */
export function inventoryCandidates(inventory: LanguageInventory): readonly LanguageCode[] {
  const codes = new Set<LanguageCode>();
  for (const language of inventory.languages) {
    const code = normalizeLanguageCode(language);
    if (code !== null) codes.add(code);
  }
  return [...codes];
}
