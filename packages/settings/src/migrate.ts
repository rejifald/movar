/**
 * Settings schema migration + per-element validation/coercion.
 *
 * Pure (no browser/storage imports) so it is unit-testable on its own and can
 * be reused by any consumer of `@movar/settings`.
 *
 * ## Why this exists
 *
 * Settings persist to `browser.storage.sync`, which **roams across devices and
 * across extension versions**. A value written by a different (older or newer)
 * build, a stale sync, or a hand-edited store can be read back at any time.
 * Reading such a value must never throw and must never let a wrong-typed,
 * duplicate, empty, or unknown-code array element reach the running config,
 * where it could corrupt language negotiation or DNR rule generation.
 *
 * ## Migration contract (roaming tolerance)
 *
 * - Missing/`undefined` `schemaVersion` is treated as the pre-versioning
 *   baseline **v0** and migrated forward step by step up to
 *   {@link CURRENT_SCHEMA_VERSION}.
 * - Steps are an ordered, additive ladder (`{ from, to, migrate }`). Future
 *   versions append a step; nothing else changes.
 * - **Forward tolerance:** a stored version *newer* than this build does NOT
 *   throw. We skip the ladder (we can't run steps we don't have), keep the
 *   stored fields we still understand, and clamp `schemaVersion` down to
 *   {@link CURRENT_SCHEMA_VERSION}. The newer device will re-stamp its own
 *   version next time it writes. Tradeoff: an older client momentarily writes
 *   back a lower version than the newest device — acceptable because every
 *   read re-validates and {@link enforceLockedLanguages} always wins.
 *
 * ## Boundary with #90 (exempt-site domains)
 *
 * {@link coerceDomainList} does only minimal element validation (drop
 * non-strings/empties, trim, de-dupe). Full exempt-site domain normalization
 * (case folding, `www.`/port/path stripping, punycode) is owned by #90 and is
 * deliberately NOT duplicated here.
 */

import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { CONCEAL_MODES, CURRENT_SCHEMA_VERSION, UI_LANGUAGES, defaultSettings } from '.';
import type { ConcealMode, MovarSettings, UiLanguage } from '.';

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

function readVersion(raw: Record<string, unknown>): number {
  const v = raw['schemaVersion'];
  // Missing/non-numeric version is the pre-versioning baseline (v0).
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Coerce an arbitrary stored value to a clean `LanguageCode[]`: drop
 * non-string elements, trim + canonicalize via {@link normalizeLanguageCode}
 * (so `ua` → `uk`), drop entries that normalize to `null` (unknown roster
 * codes), and de-dupe while preserving first-seen order. Used for `priority`
 * and `blocked`.
 */
export function coerceLanguageList(input: unknown): LanguageCode[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<LanguageCode>();
  const out: LanguageCode[] = [];
  for (const el of input) {
    if (typeof el !== 'string') continue;
    const code = normalizeLanguageCode(el);
    if (code == null || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Coerce an arbitrary stored value to a clean domain list: drop
 * non-strings/empties (after trim) and de-dupe, preserving order. Minimal by
 * design — see the #90 boundary note in the module header.
 */
export function coerceDomainList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const el of input) {
    if (typeof el !== 'string') continue;
    const trimmed = el.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function coerceConcealMode(input: unknown): ConcealMode {
  return CONCEAL_MODES.includes(input as ConcealMode)
    ? (input as ConcealMode)
    : defaultSettings.concealMode;
}

function coerceUiLanguage(input: unknown): UiLanguage {
  return UI_LANGUAGES.includes(input as UiLanguage)
    ? (input as UiLanguage)
    : defaultSettings.uiLanguage;
}

function coerceBoolean(input: unknown, fallback: boolean): boolean {
  return typeof input === 'boolean' ? input : fallback;
}

/**
 * Per-element validation/coercion over a (possibly malformed) stored record,
 * filling any missing/invalid field from {@link defaultSettings}. Does NOT
 * enforce the locked-language invariant — that must run *after* this so it
 * always wins (see `apps/extension/src/lib/settings.ts`).
 *
 * A key that is **absent** falls back to its `defaultSettings` value (the
 * forward-compatible "merge over defaults" semantics for fields added in
 * newer builds). A key that is **present but malformed** is coerced
 * element-by-element — so a deliberately-emptied list stays empty, but a
 * garbage list is cleaned rather than silently replaced with the default.
 */
export function coerceSettings(raw: unknown): MovarSettings {
  const r = asRecord(raw);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: coerceBoolean(r['enabled'], defaultSettings.enabled),
    priority: 'priority' in r ? coerceLanguageList(r['priority']) : [...defaultSettings.priority],
    blocked: 'blocked' in r ? coerceLanguageList(r['blocked']) : [...defaultSettings.blocked],
    allowlist: 'allowlist' in r ? coerceDomainList(r['allowlist']) : [...defaultSettings.allowlist],
    contentModification: coerceBoolean(
      r['contentModification'],
      defaultSettings.contentModification,
    ),
    concealMode: coerceConcealMode(r['concealMode']),
    uiLanguage: coerceUiLanguage(r['uiLanguage']),
  };
}

/** One rung of the migration ladder. `migrate` reshapes the record from
 *  version `from` to version `to`; steps are applied in order. */
interface MigrationStep {
  from: number;
  to: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered, additive migration ladder. To add v(N)→v(N+1), append a step and
 * bump {@link CURRENT_SCHEMA_VERSION}. The v0→v1 step is a no-op shape
 * carry-over: the pre-versioning shape already matches v1, so we only need to
 * stamp the version (done by {@link coerceSettings} downstream).
 */
const MIGRATIONS: readonly MigrationStep[] = [
  {
    from: 0,
    to: 1,
    migrate: (raw) => ({ ...raw, schemaVersion: 1 }),
  },
];

/**
 * Migrate an arbitrary stored value up to the schema this build understands,
 * then validate/coerce every field. Never throws (roaming tolerance — see the
 * module header). The returned object is fully typed but does NOT yet satisfy
 * the locked-language invariant; callers run `enforceLockedLanguages` last.
 */
export function migrateSettings(raw: unknown): MovarSettings {
  let record = asRecord(raw);
  const stored = readVersion(record);

  // Forward tolerance: a newer device wrote a version we don't have steps for.
  // Don't throw — keep understood fields, clamp the version, coerce.
  if (stored >= CURRENT_SCHEMA_VERSION) {
    return coerceSettings(record);
  }

  // Apply each ladder step the stored version hasn't passed yet, in order.
  // A step `{ from, to }` runs when the value is still at-or-below `from`
  // (so a value already at v1 skips the 0→1 rung) and `to` is within range.
  for (const step of MIGRATIONS) {
    if (stored <= step.from && step.to <= CURRENT_SCHEMA_VERSION) {
      record = step.migrate(record);
    }
  }
  return coerceSettings(record);
}
