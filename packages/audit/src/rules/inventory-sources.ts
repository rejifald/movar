/**
 * **Family B slice — inventory consistency and picker reachability.**
 * The hreflang-specific rules (`core/hreflang-*`) live in a sibling file; this
 * one owns cross-source agreement, cross-page consistency, and whether the
 * picker itself is a discoverable, navigable surface.
 *
 * Every rule reads the shared inventory model (`../inventory.ts`) rather than
 * re-deriving it. Only `core/inventory-varies-across-pages` needs the whole
 * collected page set — every other rule compares sources *within* one page.
 *
 * @see ../../../../docs/movar-audit-rules.md — family B
 */

import { STATIC_ONLY, SITE_ONLY, TRAVERSAL_ONLY } from '../capability';
import type { NodePath, PageEvidence, PickerOption } from '../evidence';
import type { FindingDraft } from '../finding';
import { nodeRef, pageRef, subjectOf } from '../finding';
import type { InventorySource, LanguageInventory } from '../inventory';
import { alternateLanguage, pageInventory, pickerOptionLanguage } from '../inventory';
import { resolvesToCollectedPage } from '../locator';
import type { CoreRule, Rule } from '../rule';
import { findings, notApplicable, pass } from '../rule';

const DECLARED = 'declared' as const;
const PAGE = 'page' as const;
const SITE = 'site' as const;
const FAIL = 'fail' as const;
const WARN = 'warn' as const;
const INFO = 'info' as const;

/** The FAIL draft `core/picker-option-undeclared` and `core/picker-target-unresolvable` both build for one picker entry; only the summary differs. */
function pickerOptionFailDraft(
  page: PageEvidence,
  option: PickerOption,
  summary: string,
): FindingDraft {
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: subjectOf(page, option.nodePath),
    evidence: [pageRef(page), nodeRef(page, option.nodePath)],
    summary,
  };
}

function byCode(left: string, right: string): number {
  return left.localeCompare(right);
}

/** Sorted and human-readable; never a bare empty string. */
function describeSet(languages: Iterable<string>): string {
  const list = [...languages].toSorted(byCode);
  return list.length === 0 ? 'no languages' : list.join(', ');
}

/* -------------------------------------------------------------------------- */
/* B1 — core/inventory-sources-disagree                                       */
/* -------------------------------------------------------------------------- */

const SOURCE_LABEL: Readonly<Record<InventorySource, string>> = {
  link: 'The hreflang declaration',
  header: 'The HTTP Link header',
  sitemap: 'The sitemap',
  picker: 'The language picker',
  'og-locale': 'The og:locale:alternate declaration',
};

/** For each source that declared something, what the *other* sources know that it doesn't. */
function disagreementDrafts(page: PageEvidence, inv: LanguageInventory): readonly FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const [source, declared] of inv.bySource) {
    const missing = [...inv.languages].filter((language) => !declared.has(language));
    if (missing.length === 0) continue;
    drafts.push({
      grounding: DECLARED,
      verdict: FAIL,
      subject: subjectOf(page),
      evidence: [pageRef(page)],
      summary: `${SOURCE_LABEL[source]} declares ${describeSet(declared)} on this page, but ${describeSet(missing)} ${missing.length === 1 ? 'is' : 'are'} declared by another source here — the sources disagree on this page's inventory.`,
    });
  }
  return drafts;
}

const inventorySourcesDisagree: CoreRule<'page'> = {
  id: 'core/inventory-sources-disagree',
  title: 'hreflang, picker and sitemap declare different language sets',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const inv = pageInventory(ctx.page);
    if (inv.bySource.size === 0) {
      return notApplicable('the page declares no language inventory from any source');
    }
    const drafts = disagreementDrafts(ctx.page, inv);
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* B2 — core/inventory-varies-across-pages (site scope)                       */
/* -------------------------------------------------------------------------- */

/** Evidence-array bound, not a detection threshold — the count stated is always exact. */
const MAX_CITED_PAGES = 5;

interface PageGroup {
  readonly languages: ReadonlySet<string>;
  readonly pages: PageEvidence[];
}

/** Pages grouped by their exact declared language set, in first-seen order. */
function groupBySignature(pages: readonly PageEvidence[]): readonly PageGroup[] {
  const groups = new Map<string, PageGroup>();
  for (const page of pages) {
    const languages = pageInventory(page).languages;
    const signature = [...languages].toSorted(byCode).join('|');
    const existing = groups.get(signature);
    if (existing === undefined) groups.set(signature, { languages, pages: [page] });
    else existing.pages.push(page);
  }
  return [...groups.values()];
}

function varianceDraft(group: PageGroup, baseline: PageGroup, totalPages: number): FindingDraft {
  return {
    grounding: DECLARED,
    verdict: FAIL,
    subject: {},
    evidence: group.pages.slice(0, MAX_CITED_PAGES).map((page) => pageRef(page)),
    summary: `${group.pages.length} of ${totalPages} collected pages declare ${describeSet(group.languages)}, while ${baseline.pages.length} declare ${describeSet(baseline.languages)} — the site's inventory is not consistent across pages.`,
  };
}

const inventoryVariesAcrossPages: CoreRule<'site'> = {
  id: 'core/inventory-varies-across-pages',
  title: 'Pages of the same site declare different inventories',
  capabilities: SITE_ONLY,
  grounding: DECLARED,
  scope: SITE,
  run(ctx) {
    const groups = groupBySignature(ctx.pages);
    if (groups.length <= 1) return pass();
    // The largest group is the site's norm; every other group is the variance.
    const baseline = groups.reduce((a, b) => (b.pages.length > a.pages.length ? b : a));
    const drafts: FindingDraft[] = groups
      .filter((group) => group !== baseline)
      .map((group) => varianceDraft(group, baseline, ctx.pages.length));
    return findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* B3 — core/inventory-undetermined                                           */
/* -------------------------------------------------------------------------- */

function undeterminedDraft(
  page: PageEvidence,
  node: NodePath | undefined,
  signal: string,
): FindingDraft {
  return {
    grounding: DECLARED,
    verdict: INFO,
    subject: subjectOf(page, node),
    evidence: node === undefined ? [pageRef(page)] : [pageRef(page), nodeRef(page, node)],
    summary: `${signal}, but none resolve to a language Movar can identify, so no inventory could be derived from them.`,
  };
}

const inventoryUndetermined: CoreRule<'page'> = {
  id: 'core/inventory-undetermined',
  title: 'Multilingual signals present, no inventory derivable',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { alternates, picker } = ctx.page.document;
    if (alternates.length === 0 && picker === null) {
      return notApplicable('the page carries no alternate links and no language picker');
    }
    const drafts: FindingDraft[] = [];
    if (
      alternates.length > 0 &&
      alternates.every((alternate) => alternateLanguage(alternate) === null)
    ) {
      drafts.push(
        undeterminedDraft(
          ctx.page,
          undefined,
          `The page declares ${alternates.length} alternate link(s)`,
        ),
      );
    }
    if (
      picker !== null &&
      picker.options.length > 0 &&
      picker.options.every((option) => pickerOptionLanguage(option.label) === null)
    ) {
      drafts.push(
        undeterminedDraft(
          ctx.page,
          picker.nodePath,
          `The page exposes a ${picker.kind} picker with ${picker.options.length} option(s)`,
        ),
      );
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* B4/B5 — the picker against the site's other declared sources               */
/* -------------------------------------------------------------------------- */

const DECLARATION_SOURCES: readonly InventorySource[] = ['link', 'header', 'sitemap'];

/** The union of everything this page declares outside the picker. */
function declaredElsewhere(inv: LanguageInventory): ReadonlySet<string> {
  const union = new Set<string>();
  for (const source of DECLARATION_SOURCES) {
    for (const language of inv.bySource.get(source) ?? []) union.add(language);
  }
  return union;
}

const pickerOptionUndeclared: CoreRule<'page'> = {
  id: 'core/picker-option-undeclared',
  title: 'Picker offers a language nothing else declares',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');
    const declared = declaredElsewhere(pageInventory(ctx.page));
    if (declared.size === 0) {
      return notApplicable(
        'the page declares no hreflang, header, or sitemap alternates to compare the picker against',
      );
    }
    const drafts: FindingDraft[] = [];
    for (const option of picker.options) {
      const language = pickerOptionLanguage(option.label);
      if (language === null || declared.has(language)) continue;
      drafts.push(
        pickerOptionFailDraft(
          ctx.page,
          option,
          `The picker offers "${option.label}" (${language}), but no hreflang, header, or sitemap source on this page declares ${language} — search engines have no declared way to discover this version.`,
        ),
      );
    }
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

const pickerOmitsDeclaredLanguage: CoreRule<'page'> = {
  id: 'core/picker-omits-declared-language',
  title: 'A declared language is absent from the picker',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');
    const inv = pageInventory(ctx.page);
    const declared = declaredElsewhere(inv);
    const offered = inv.bySource.get('picker') ?? new Set<string>();
    const missing = [...declared].filter((language) => !offered.has(language));
    if (missing.length === 0) return pass();
    const drafts: FindingDraft[] = missing.map((language) => ({
      grounding: DECLARED,
      verdict: WARN,
      subject: subjectOf(ctx.page, picker.nodePath),
      evidence: [pageRef(ctx.page), nodeRef(ctx.page, picker.nodePath)],
      summary: `Another source on this page declares a ${language} version, but the picker offers no entry for it, so a visitor has no manual way to switch to it.`,
    }));
    return findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* B6 — core/picker-no-navigable-target                                       */
/* -------------------------------------------------------------------------- */

const pickerNoNavigableTarget: CoreRule<'page'> = {
  id: 'core/picker-no-navigable-target',
  title: 'Picker entry exposes no URL — no href, no hreflang, no navigable target',
  capabilities: STATIC_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');
    // The active entry is legitimately link-less on most switchers — you are
    // already on that page. Only the *other* entries need to be reachable.
    const unreachable = picker.options.filter((option) => option.href === null && !option.active);
    if (unreachable.length === 0) return pass();
    const drafts: FindingDraft[] = unreachable.map((option) =>
      pickerOptionFailDraft(
        ctx.page,
        option,
        `The picker's "${option.label}" entry exposes no href, so search engines cannot discover this language version and assistive technology cannot navigate to it — only a mouse-driven script could.`,
      ),
    );
    return findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* B7 — core/picker-target-unresolvable                                       */
/* -------------------------------------------------------------------------- */

const pickerTargetUnresolvable: CoreRule<'page'> = {
  id: 'core/picker-target-unresolvable',
  title: 'Picker target 404s, or is absent from the build',
  /**
   * The catalogue reads "`static` | `traversal`" for this rule — an alternation,
   * not a conjunction. Filesystem evidence grants `traversal` for free
   * (`hasTraversal` in `capability.ts`), so declaring `traversal` alone is
   * exactly what the alternation means; no OR mechanism is invented here.
   */
  capabilities: TRAVERSAL_ONLY,
  grounding: DECLARED,
  scope: PAGE,
  run(ctx) {
    const { picker } = ctx.page.document;
    if (picker === null) return notApplicable('the page exposes no language picker');
    const drafts: FindingDraft[] = [];
    let checked = 0;
    for (const option of picker.options) {
      if (option.href === null) continue;
      checked += 1;
      if (resolvesToCollectedPage(ctx.pages, ctx.page, option.href)) continue;
      drafts.push(
        pickerOptionFailDraft(
          ctx.page,
          option,
          `The picker's "${option.label}" entry points to ${option.href}, but no page in the collected set resolves to it, so the target cannot be confirmed reachable.`,
        ),
      );
    }
    if (checked === 0) return notApplicable('no picker entry declares an href to resolve');
    return drafts.length === 0 ? pass() : findings(...drafts);
  },
};

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Family B slice, in catalogue order. Not a `RuleFamily` — the caller
 * assembles family B from this array plus the hreflang sibling's.
 */
export const inventorySourceRules: readonly Rule[] = [
  inventorySourcesDisagree,
  inventoryVariesAcrossPages,
  inventoryUndetermined,
  pickerOptionUndeclared,
  pickerOmitsDeclaredLanguage,
  pickerNoNavigableTarget,
  pickerTargetUnresolvable,
];
