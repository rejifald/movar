/** Movar settings schema, defaults, and the locked-language invariant. */

import type { LanguageCode } from '@movar/lang-detect';

/**
 * Locale for Movar's own UI (popup, options). 'auto' follows the browser UI
 * language — only 'en' and 'uk' are translated today; anything else falls back
 * to 'en'. Distinct from {@link MovarSettings.priority}, which is the user's
 * content-language preference negotiated with sites.
 */
export type UiLanguage = 'auto' | 'en' | 'uk';

export const UI_LANGUAGES: readonly UiLanguage[] = ['auto', 'en', 'uk'];

/**
 * How blocked-language content cards are concealed when filtering is on.
 *
 *   curtain — overlay a reversible blur curtain with a "Show" affordance.
 *   hide    — remove every blocked card with `display:none`.
 *
 * The user setting is global: curtain means a curtain wherever content cards
 * are filtered; hide means hard-hide wherever content cards are filtered. See
 * docs/content-filtering-modes.md.
 */
export type ConcealMode = 'curtain' | 'hide';

export const CONCEAL_MODES: readonly ConcealMode[] = ['curtain', 'hide'];

/**
 * Current settings schema version this build understands. Bumped whenever a
 * field is renamed or its representation changes; each bump pairs with a
 * migration step (see {@link migrateSettings}). Stamped into every stored
 * value via {@link defaultSettings.schemaVersion}.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export interface MovarSettings {
  /**
   * Internal, managed schema marker — NOT user-editable. Used by
   * {@link migrateSettings} to upgrade values that roam in across
   * `storage.sync` from older (or newer) builds. The UI must never expose it.
   */
  schemaVersion: number;
  enabled: boolean;
  /** Ordered language priority; the first available language wins. */
  priority: LanguageCode[];
  /** Languages to strip from on-site language switchers (only when contentModification is on). */
  blocked: LanguageCode[];
  /** Domains where Movar takes no action. */
  allowlist: string[];
  /**
   * Allow Movar to modify page DOM: hide blocked-language entries in
   * on-site language pickers and blur content cards in a blocked language.
   * Off by default — the safer baseline ships only header/URL-level switching.
   */
  contentModification: boolean;
  /**
   * When {@link contentModification} is on, how blocked content cards are
   * concealed: behind a reversible {@link ConcealMode} 'curtain' (default) or
   * fully 'hidden'. Ignored while `contentModification` is off.
   */
  concealMode: ConcealMode;
  /** Locale for Movar's own UI; 'auto' follows browser UI language. */
  uiLanguage: UiLanguage;
}

export const defaultSettings: MovarSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: false,
  concealMode: 'curtain',
  uiLanguage: 'auto',
};

/**
 * Languages that are permanently blocked. The UI must not offer to remove
 * them from {@link MovarSettings.blocked} or add them to
 * {@link MovarSettings.priority}, and {@link enforceLockedLanguages} re-asserts
 * the invariant at the storage boundary so a stale sync from another device,
 * a hand-edited storage value, or a UI bug can't quietly disable the policy.
 *
 * Russian is locked because Movar's whole reason for existing is helping
 * Ukrainians dodge Russian content — making it user-toggleable would invite
 * "I switched it off and forgot" footguns that break the product premise.
 */
export const LOCKED_BLOCKED_LANGUAGES: readonly LanguageCode[] = ['ru'];

export function isLockedBlocked(code: LanguageCode): boolean {
  return LOCKED_BLOCKED_LANGUAGES.includes(code);
}

/**
 * Coerce `settings` to satisfy the locked-language invariant: every locked
 * code is present in `blocked`, and no locked code is in `priority`. Pure;
 * returns a new object when a change is needed. Idempotent.
 */
export function enforceLockedLanguages(settings: MovarSettings): MovarSettings {
  const blocked = [...settings.blocked];
  for (const code of LOCKED_BLOCKED_LANGUAGES) {
    if (!blocked.includes(code)) blocked.push(code);
  }
  const priority = settings.priority.filter((c) => !isLockedBlocked(c));
  // Avoid allocating a new settings object when nothing changed.
  if (blocked.length === settings.blocked.length && priority.length === settings.priority.length) {
    return settings;
  }
  return { ...settings, blocked, priority };
}

// ─── Exempt-site (allowlist) domain normalization ─────────────────────────
//
// The canonical form for a stored exempt domain. Owned here (#90) — the
// migration module (migrate.ts) deliberately defers full normalization to this
// so it isn't duplicated. Both the UI input side (options/popup) and the app's
// storage boundary normalize through these, so a domain is stored one way and
// matched one way: `hostMatchesDomain` (the runtime matcher) only folds case
// and a trailing dot, so anything it must still match — a `www.` host, a pasted
// URL — has to be reduced to the bare registrable form BEFORE it is stored.

/** Reduce whatever the user typed — a full URL, a `www.` host, mixed case, a
 *  trailing path or port — to the bare lowercase domain used for storage and
 *  matching. Not a validator on its own: pair with {@link DOMAIN_PATTERN}. */
export function normaliseDomain(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      // eslint-disable-next-line sonarjs/slow-regex -- linear pattern (single greedy `.*` with no overlapping quantifier or alternation cannot backtrack catastrophically); input is the user's own typed domain, bounded and trusted
      .replace(/[/:].*$/, '')
  );
}

/** A syntactically valid registrable domain: dot-separated `[a-z0-9]`(+hyphen)
 *  labels, at least one dot. Rejects wildcards, schemes, paths, ports, and bare
 *  single labels — matching is exact-domain-plus-subdomains, with no
 *  public-suffix or wildcard support (see docs/exempt-sites.md). */
export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Whether `input` reduces to a domain that {@link normalizeAllowlist} would
 *  actually keep — i.e. a host/URL that can be stored as an exempt entry. A
 *  dotless host (`localhost`, an intranet name) normalises to a bare label that
 *  {@link DOMAIN_PATTERN} rejects, so it would be silently dropped at the
 *  storage boundary. UI surfaces gate their "exempt this site" affordance on
 *  this so they never offer an action that reloads the tab without storing
 *  anything. Same rule the boundary applies per-entry, expressed for one host. */
export function isStorableDomain(input: string): boolean {
  return DOMAIN_PATTERN.test(normaliseDomain(input));
}

/** Canonicalize an exempt-site allowlist: normalise each entry, drop any that
 *  isn't a syntactically valid domain, and de-dupe (first-seen order). Pure and
 *  idempotent. Applied at the settings boundary so the runtime host matcher and
 *  the DNR `excludedRequestDomains` both see one canonical form. */
export function normalizeAllowlist(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const domain = normaliseDomain(raw);
    if (domain === '' || !DOMAIN_PATTERN.test(domain) || seen.has(domain)) continue;
    seen.add(domain);
    out.push(domain);
  }
  return out;
}
