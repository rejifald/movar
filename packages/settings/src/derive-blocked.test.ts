import { normalizeLanguageCode } from '@movar/lang-detect';
import { describe, expect, it } from 'vitest';
import {
  IMPOSED_OVER,
  LOCKED_BLOCKED_LANGUAGES,
  defaultSettings,
  deriveBlocked,
  enforceLockedLanguages,
} from './index';

describe('deriveBlocked', () => {
  it('always blocks the locked languages, whatever the priority', () => {
    expect(deriveBlocked(['uk', 'en'])).toContain('ru');
    expect(deriveBlocked(['en'])).toContain('ru');
    expect(deriveBlocked([])).toEqual([...LOCKED_BLOCKED_LANGUAGES]);
  });

  it('keeps the lock even when a caller passes a locked code in priority', () => {
    // `enforceLockedLanguages` strips locked codes before calling this, so the
    // published `\ priority` subtraction would be equivalent — but the lock must
    // not depend on call order for a direct caller.
    expect(deriveBlocked(['ru', 'en'])).toContain('ru');
  });

  it('unions the imposers of every native language in priority', () => {
    // `be` imposes `ru` just as `uk` does; the union de-dupes against the lock.
    expect(deriveBlocked(['be', 'en'])).toEqual(['ru']);
    expect(deriveBlocked(['uk', 'be', 'en'])).toEqual(['ru']);
  });

  it('subtracts priority, so a non-locked imposer stays overridable', () => {
    // The bilingual case: enabling the imposer removes it from the block list.
    // `ca` is inert today (see the reachability test), so this exercises the
    // subtraction directly on the map's own data.
    expect(deriveBlocked(['ca'])).toEqual(['ru', 'es']);
    expect(deriveBlocked(['ca', 'es'])).toEqual(['ru']);
  });

  it('is deterministic and order-stable — locked first, then priority order', () => {
    // `settings-reaction.ts` compares `blocked` positionally, so an unstable
    // order would trigger spurious page rebuilds.
    expect(deriveBlocked(['ca', 'uk'])).toEqual(['ru', 'es']);
    expect(deriveBlocked(['uk', 'ca'])).toEqual(['ru', 'es']);
  });

  it('is idempotent as a function of priority', () => {
    const once = deriveBlocked(['uk', 'en']);
    expect(deriveBlocked(['uk', 'en'])).toEqual(once);
    // Re-deriving from an unchanged priority never grows the list.
    expect(deriveBlocked([...defaultSettings.priority])).toEqual(once);
  });

  it('never emits a duplicate', () => {
    const blocked = deriveBlocked(['uk', 'be', 'ca', 'gl']);
    expect(new Set(blocked).size).toBe(blocked.length);
  });
});

describe('IMPOSED_OVER reachability', () => {
  it('pins which rows can actually bite today (imposed-over-reachability)', () => {
    // `priority` is coerced through `normalizeLanguageCode`, so a key outside its
    // alias table (uk/ru/be/bg/en/pl/de/es/fr/it today) can never reach
    // `deriveBlocked`. Those rows are deliberate forward-looking policy, not live
    // behaviour — this test is the tripwire that tells us when the roster grows
    // into them.
    const reachable = Object.keys(IMPOSED_OVER).filter((k) => normalizeLanguageCode(k) != null);
    const inert = Object.keys(IMPOSED_OVER).filter((k) => normalizeLanguageCode(k) == null);
    expect(reachable).toEqual(['uk', 'be']);
    expect(inert).toEqual(['kk', 'ca', 'gl']);
  });

  it('emits an imposed code that itself survives coercion', () => {
    // A derived code that coercion would drop on the next read would break
    // convergence — the boundary would fight itself forever.
    for (const rows of Object.values(IMPOSED_OVER)) {
      for (const { imposed } of rows) expect(normalizeLanguageCode(imposed)).toBe(imposed);
    }
    for (const code of LOCKED_BLOCKED_LANGUAGES) {
      expect(normalizeLanguageCode(code)).toBe(code);
    }
  });
});

/** The ADR's overlay: every imposer the priority list pulls in, plus the locks. */
function overlayOf(priority: readonly string[]): Set<string> {
  return new Set([
    ...LOCKED_BLOCKED_LANGUAGES,
    ...priority.flatMap((n) => (IMPOSED_OVER[n] ?? []).map((r) => r.imposed)),
  ]);
}

describe('classifier candidate set', () => {
  // `content-modification.ts` builds candidates as `priority ∪ settings.blocked`.
  // Scope item 4 of #89 asks for `enabled ∪ overlay`. Those are the same set once
  // `blocked` is derived, because the union adds back exactly what the `\ priority`
  // subtraction removed — this pins that identity so the consumer can keep its
  // shape instead of growing a second derivation.
  it.each([['uk', 'en'], ['be', 'en'], ['en'], ['ca', 'es'], ['uk', 'be', 'ca'], []])(
    'priority ∪ derived blocked === enabled ∪ overlay for %j',
    (...priority: string[]) => {
      const union = new Set([...priority, ...deriveBlocked(priority)]);
      const expected = new Set([...priority, ...overlayOf(priority)]);
      expect([...union].toSorted()).toEqual([...expected].toSorted());
    },
  );
});

describe('defaultSettings', () => {
  it('ships the block list its own priority derives', () => {
    expect(defaultSettings.blocked).toEqual(deriveBlocked(defaultSettings.priority));
  });
});

describe('enforceLockedLanguages (derived block list)', () => {
  it('converges a stale stored blocked list to the derived set', () => {
    // A value synced from a build that still shipped the block-list editor.
    const stored = { ...defaultSettings, priority: ['uk', 'en'], blocked: ['ru', 'bg'] };
    expect(enforceLockedLanguages(stored).blocked).toEqual(['ru']);
  });

  it('converges a same-length but wrong stored list', () => {
    // The case a length-only comparison would silently pass through.
    const stored = { ...defaultSettings, priority: ['uk', 'en'], blocked: ['bg'] };
    expect(enforceLockedLanguages(stored).blocked).toEqual(['ru']);
  });

  it('re-derives when priority changes, with no UI interaction', () => {
    const next = enforceLockedLanguages({ ...defaultSettings, priority: ['be', 'en'] });
    expect(next.blocked).toEqual(['ru']);
    expect(next.priority).toEqual(['be', 'en']);
  });

  it('keeps Russian out of priority and in blocked', () => {
    const next = enforceLockedLanguages({
      ...defaultSettings,
      priority: ['uk', 'ru', 'en'],
      blocked: [],
    });
    expect(next.priority).toEqual(['uk', 'en']);
    expect(next.blocked).toEqual(['ru']);
  });

  it('is idempotent', () => {
    const once = enforceLockedLanguages({
      ...defaultSettings,
      priority: ['uk', 'ru'],
      blocked: [],
    });
    expect(enforceLockedLanguages(once)).toEqual(once);
  });

  it('returns the same object when nothing needs changing', () => {
    // Cheap identity check so a settled value does not churn React state.
    expect(enforceLockedLanguages(defaultSettings)).toBe(defaultSettings);
  });
});
