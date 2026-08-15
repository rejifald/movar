/**
 * The catalogue's size is a number repeated in prose, and prose does not
 * recompile. It has already drifted once: the catalogue grew from 41 to 46
 * rules and cross-references elsewhere in `docs/` went on quoting 41, so the
 * catalogue contradicted its own callers one click away.
 *
 * `src/ruleset.test.ts` already pins the per-family counts against the code.
 * What nothing pinned is the *documented* figure — `pnpm check:readme` covers
 * `README.md` only. So the docs are asserted against the ruleset here, and a
 * rule added or removed without a doc edit fails this package's tests.
 *
 * This is a documentation-parity check, not a kernel unit test: it reads files
 * outside the package. That is why it lives under `test/` rather than beside
 * the kernel's own assertions in `src/`.
 *
 * It then drifted a second way, which is why the `CORE` block below exists. The
 * dogfood gate runs `CORE_RULESET` with no `--ua`, so its number is 40, not the
 * catalogue's 46 — and both sites describing it were wrong in *opposite*
 * directions: `AGENTS.md` said 41 (never recounted) while `project.json` said
 * 46 (recounted against the wrong ruleset, and self-contradicting, since the
 * same comment explains why 6 of those 46 are never evaluated). Asserting every
 * claim against `CATALOGUE` would have ratified the second mistake, so each
 * claim is checked against the ruleset it actually means.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '../src/ruleset';

const REPO_ROOT = new URL('../../../', import.meta.url);

function readDoc(relativePath: string): string {
  return readFileSync(new URL(relativePath, REPO_ROOT), 'utf8');
}

/**
 * What the catalogue documents is the core plus the one shipped jurisdiction
 * pack — the same composition `--ua` produces. The core alone is a different,
 * smaller number, and the docs are explicit about which they mean.
 */
const CATALOGUE = withPack(CORE_RULESET, ...UA_PACK_FAMILIES);

/** The single capture of `pattern`, as a number. Fails loudly if it is absent. */
function claimedCount(source: string, pattern: RegExp, what: string): number {
  const match = pattern.exec(source);
  expect(
    match,
    `could not find ${what} — the wording moved, so this guard stopped guarding`,
  ).not.toBeNull();
  return Number(match?.[1]);
}

describe('the rule count claimed in the docs', () => {
  it('matches the ruleset in the catalogue headline', () => {
    const doc = readDoc('docs/movar-audit-rules.md');
    expect(claimedCount(doc, /\*\*(\d+) rules\.\*\*/, 'the "**N rules.**" headline')).toBe(
      CATALOGUE.rules.length,
    );
    expect(claimedCount(doc, /(\d+) checks across six families/, 'the front-matter summary')).toBe(
      CATALOGUE.rules.length,
    );
  });

  it('matches the ruleset in the catalogue family index, family by family', () => {
    const doc = readDoc('docs/movar-audit-rules.md');
    const rows = [...doc.matchAll(/^\|\s*\[([A-Z])\.[^\]]*\]\([^)]*\)\s*\|\s*(\d+)\s*\|/gm)];

    // Without this the whole test passes vacuously the day the table is
    // reformatted, which is exactly when it needs to be loud.
    expect(rows).toHaveLength(CATALOGUE.families.length);

    const documented = Object.fromEntries(rows.map((row) => [row[1], Number(row[2])]));
    const actual = Object.fromEntries(
      CATALOGUE.families.map((family) => [family.id.charAt(0), family.rules.length]),
    );
    expect(documented).toEqual(actual);

    const summed = rows.reduce((total, row) => total + Number(row[2]), 0);
    expect(summed).toBe(CATALOGUE.rules.length);
  });

  it('matches the ruleset in the ADR that cross-references the catalogue', () => {
    const doc = readDoc('docs/movar-audit.md');
    expect(
      claimedCount(doc, /the rule catalogue: (\d+) checks/, "the ADR's catalogue cross-reference"),
    ).toBe(CATALOGUE.rules.length);
  });

  /**
   * The catalogue's rule tables, checked by membership rather than by total. A
   * matching count can still hide a rename, and a rename is the expensive kind
   * of drift: rule IDs are the public API a suppression cites, so one that is
   * renamed without its row silently stops suppressing.
   *
   * The "Deliberately excluded" table is not swept up by this: its rows are
   * prose descriptions of things that are *not* rules, not `pack/id`s.
   */
  it('documents exactly the rules the catalogue registers, by ID', () => {
    const doc = readDoc('docs/movar-audit-rules.md');
    const documented = [...doc.matchAll(/^\| `((?:core|ua)\/[a-z0-9-]+)`/gm)].map((row) => row[1]);

    expect(new Set(documented).size, 'a rule ID is listed twice').toBe(documented.length);
    expect(documented.toSorted()).toEqual(CATALOGUE.rules.map((rule) => rule.id).toSorted());
  });

  /**
   * The dogfood gate is the core alone. `nx run marketing:audit` passes no
   * `--ua`, and the pack must not even be evaluated against a site that
   * declares no Ukrainian-market signal, so a claim about how this repo judges
   * movar.fyi is a claim about `CORE_RULESET` — never the catalogue total.
   */
  describe('the dogfood gate, which runs the core alone', () => {
    it('matches the core in the package guide', () => {
      const doc = readDoc('packages/audit/AGENTS.md');
      expect(
        claimedCount(
          doc,
          /judge movar\.fyi by the same (\d+)\s+core rules/,
          "AGENTS.md's dogfood-gate claim",
        ),
      ).toBe(CORE_RULESET.rules.length);
    });

    it('matches the core in the nx target comment', () => {
      const doc = readDoc('apps/marketing/project.json');
      expect(
        claimedCount(
          doc,
          /against the same (\d+) core rules/,
          "the marketing audit target's comment",
        ),
      ).toBe(CORE_RULESET.rules.length);
    });

    it('is a smaller number than the catalogue, or these assertions are the same test', () => {
      expect(CORE_RULESET.rules.length).toBeLessThan(CATALOGUE.rules.length);
    });
  });
});
