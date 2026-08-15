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
});
