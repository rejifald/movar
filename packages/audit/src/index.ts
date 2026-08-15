/**
 * `@movar/audit` — the Movar Audit kernel.
 *
 * `evaluate(evidence, ruleset) → Report`, pure and I/O-free. Collectors live in
 * each runtime (Node + Playwright, Swift `URLSession` + `WKWebView`, the
 * diagnostics content script) and share nothing but the serializable
 * `Evidence` they emit.
 *
 * `Evidence` and the rule IDs — not this module graph — are the public API.
 * A report published today must still replay in three years, or the
 * falsifiability claim expires.
 *
 * @see ../../docs/movar-audit.md — the architecture
 * @see ../../docs/movar-audit-rules.md — the rule catalogue
 */

// --- the kernel -------------------------------------------------------------
export { evaluate } from './evaluate';

// --- evidence ---------------------------------------------------------------
export { EVIDENCE_SCHEMA_VERSION } from './evidence';
export type {
  AlternateLink,
  Attachment,
  CollectorStamp,
  CookieState,
  DocumentEvidence,
  Evidence,
  EvidenceSource,
  FilesystemSource,
  LangAttribute,
  LinkTarget,
  NetworkSource,
  NodePath,
  PageEvidence,
  PageReach,
  PickerEvidence,
  PickerOption,
  ProbeEvidence,
  ProbeOutcome,
  Rect,
  RedirectHop,
  RobotsPosture,
  ScreenshotViewport,
  TextNodeSample,
  TextSampling,
  Vantage,
  VantageCountry,
} from './evidence';

// --- capabilities -----------------------------------------------------------
export { adjudicableProbes, deriveCapabilities, missingCapabilities } from './capability';
export type { Capability } from './capability';

// --- findings and grading ---------------------------------------------------
export { effectiveGrounding } from './finding';
export type {
  Citation,
  ClassifiedFindingDraft,
  Denominator,
  EvidenceRef,
  Finding,
  FindingDraft,
  FindingScreenshot,
  FindingSubject,
  FindingVerdict,
  Grounding,
  GroundedFindingDraft,
  RuleScope,
  Verdict,
  Via,
} from './finding';
export { gradeFinding, RuleContractError } from './grading';

// --- the rule contract ------------------------------------------------------
export { findings, notApplicable, pass, ruleCitation } from './rule';
export type { CoreRule, PackRule, Rule, RuleContext, RuleFamily, RuleOutcome } from './rule';

// --- rulesets ---------------------------------------------------------------
export {
  CORE_RULESET,
  createRuleset,
  DuplicateRuleIdError,
  RULESET_VERSION,
  UA_PACK_FAMILIES,
  withPack,
} from './ruleset';
export type { Ruleset, RulesetInput } from './ruleset';

// --- suppressions -----------------------------------------------------------
export { applySuppressions, MIN_REASON_LENGTH, parseSuppressionPolicy } from './suppress';
export type {
  SuppressedFinding,
  Suppression,
  SuppressionOutcome,
  SuppressionPolicy,
  SuppressionViolation,
} from './suppress';

// --- the classifier seam ----------------------------------------------------
export { createSnippetClassifier } from './classifier';
export type { ClassifiedText, Classifier } from './classifier';

// --- reports ----------------------------------------------------------------
export { REPORT_SCHEMA_VERSION } from './report';
export type { CoverageSummary, EvidenceStamp, Report, RuleResult, RulesetStamp } from './report';

// --- the artifact -----------------------------------------------------------
export { renderReportArtifact } from './artifact';
export type { ArtifactInput } from './artifact';

// --- rule families ----------------------------------------------------------
export { pageDeclarationFamily } from './rules/page-declaration';
export { inventoryFamily } from './rules/inventory';
export { servingFamily } from './rules/serving';
export { switchFamily } from './rules/switch';
export { contentLanguageFamily } from './rules/content-language';
export { uaPackFamily } from './rules/ua';

// --- shared models rule families read ---------------------------------------
export { declaredLanguageOf, isWellFormedBCP47, primarySubtag } from './bcp47';
export { urlLanguageMarker } from './url-language';
export type { UrlLanguageMarker } from './url-language';
export {
  alternateLanguage,
  INVENTORY_SOURCES,
  inventoryCandidates,
  pageInventory,
  pickerOptionLanguage,
  siteInventory,
  X_DEFAULT,
} from './inventory';
export type { InventorySource, LanguageInventory } from './inventory';
export { locatorOf, parseLocator, resolvesToCollectedPage, resolveTargetPage } from './locator';
export type { Locator } from './locator';
export {
  classifiablePageLanguage,
  classifiableSnippet,
  classifySamples,
  CLASSIFIER_CANDIDATES,
  MAX_CITED_PASSAGES,
  MIN_CLASSIFIABLE_CHARS,
  textNodeDenominator,
} from './text-samples';
export type { ClassifiedSample } from './text-samples';
