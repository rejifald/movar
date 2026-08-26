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
 *
 * It has now drifted a third way, and that is why the perimeter is a sweep
 * rather than a list. The fix that added this file wrote a fresh present-tense
 * count into `docs/movar-audit-dogfood-targets.md`, which this guard did not
 * read: the next recount would have failed on the two files it did read, been
 * corrected there, gone green, and left the third stale — the very drift this
 * file exists to stop, reintroduced inside its own fix. A guard that protects
 * the files somebody remembered to list is always one edit from that. So the
 * named assertions below are joined by a sweep of every `.md` under `docs/`,
 * and a count in a doc nobody thought of is covered the day it is written.
 */

import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * A rule-count claim: a bare `N rules` / `N checks`, or `N core rules` for the
 * core-only set the dogfood gate runs. The bareness is the whole discriminator
 * — a count of some *subset* of the rules is written in English with a
 * qualifier ("the seven serving rules", "34 of them offline"), and is left
 * alone, while a bare number is what every reader takes for the total.
 */
const COUNT_CLAIM = /(\d+)\s+(core\s+)?(?:rules?|checks?)(?![\w-])/g;

/** `<!-- rule-count-frozen: N — why -->`. The reason is not optional. */
const FROZEN_MARKER = /<!--\s*rule-count-frozen:\s*(\d+)([\s\S]*?)-->/g;

/**
 * Every `.md` under `docs/`, plus this package's guide, which states the
 * catalogue total and the dogfood gate's core count in prose exactly as a doc
 * does. `apps/marketing/project.json` states one too and keeps its named
 * assertion instead: a JSON comment string has nowhere to put the freeze marker
 * the convention rests on, and one line already spoken for is not a perimeter.
 */
function sweptDocs(): readonly string[] {
  return [...markdownUnder('docs/'), 'packages/audit/AGENTS.md'].toSorted();
}

function markdownUnder(directory: string): string[] {
  return readdirSync(new URL(directory, REPO_ROOT), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? markdownUnder(`${directory}${entry.name}/`)
      : entry.name.endsWith('.md')
        ? [`${directory}${entry.name}`]
        : [],
  );
}

/**
 * A fenced block is a transcript of a run — what the tool printed on a day, not
 * a claim the doc makes in its own voice — so its numbers are not swept. Blanked
 * in place rather than removed, so every offset and line number still points at
 * the file on disk.
 */
function withoutTranscripts(source: string): string {
  return source.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1/gm, (fence) =>
    fence.replace(/[^\n]/g, ' '),
  );
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

interface Block {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** The document's blank-line-delimited blocks, in order, with their offsets. */
function blocksOf(source: string): Block[] {
  const blocks: Block[] = [];
  let start = 0;
  for (const gap of source.matchAll(/\n{2,}/g)) {
    blocks.push({ text: source.slice(start, gap.index), start, end: gap.index });
    start = gap.index + gap[0].length;
  }
  blocks.push({ text: source.slice(start), start, end: source.length });
  return blocks;
}

function blockAt(blocks: readonly Block[], index: number): number {
  return blocks.findIndex((block) => index >= block.start && index <= block.end);
}

/**
 * A freeze marker and the claim it freezes are one block apart, not one line:
 * Prettier lifts an HTML comment out of the paragraph it follows and onto its
 * own, so the marker cannot live inside the sentence it annotates and lives
 * directly under it instead. That pair of blocks is the whole reach — enough
 * for the note a writer just wrote, too little to reach across a section and
 * silence a number they have never read.
 */
function textAround(blocks: readonly Block[], block: number, reach: readonly number[]): string {
  return reach
    .map((offset) => block + offset)
    .filter((at) => at >= 0 && at < blocks.length)
    .map((at) => blocks[at].text)
    .join('\n\n');
}

/** What a marker says after the number it freezes, with the separator stripped. */
function reasonOf(marker: RegExpExecArray): string {
  return marker[2].replace(/^[\s–—:-]+/, '').trim();
}

/** The numbers this text freezes. A marker with no reason freezes nothing. */
function frozenIn(text: string): Set<number> {
  return new Set(
    [...text.matchAll(FROZEN_MARKER)]
      .filter((marker) => reasonOf(marker) !== '')
      .map((marker) => Number(marker[1])),
  );
}

interface CountClaim {
  /** `path:line`, so a failure names the sentence to edit. */
  readonly at: string;
  readonly claimed: number;
  /** Which ruleset the wording names. Bare means the catalogue. */
  readonly names: 'catalogue' | 'core';
  /** A count of what the catalogue held at some past moment, frozen in place. */
  readonly frozen: boolean;
}

function countClaimsIn(path: string): CountClaim[] {
  const source = withoutTranscripts(readDoc(path));
  const blocks = blocksOf(source);
  return [...source.matchAll(COUNT_CLAIM)].map((claim) => ({
    at: `${path}:${lineAt(source, claim.index)}`,
    claimed: Number(claim[1]),
    names: claim[2] ? 'core' : 'catalogue',
    // A claim reads the markers in its own block and in the one below it.
    frozen: frozenIn(textAround(blocks, blockAt(blocks, claim.index), [0, 1])).has(
      Number(claim[1]),
    ),
  }));
}

/** Every way a freeze marker in `path` has stopped saying anything true. */
function brokenMarkersIn(path: string): string[] {
  const source = withoutTranscripts(readDoc(path));
  const blocks = blocksOf(source);
  return [...source.matchAll(FROZEN_MARKER)].flatMap((marker) => {
    const at = `${path}:${lineAt(source, marker.index)}`;
    if (reasonOf(marker) === '') return [`${at} freezes ${marker[1]} without saying why`];

    // The mirror of the claim's reach: its own block and the one above it.
    const reached = textAround(blocks, blockAt(blocks, marker.index), [-1, 0]);
    const stillStated = [...reached.matchAll(COUNT_CLAIM)].some((claim) => claim[1] === marker[1]);
    return stillStated
      ? []
      : [`${at} freezes ${marker[1]}, which the prose it sits under no longer states`];
  });
}

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

  /**
   * The assertions above cover the files somebody remembered to list. This one
   * covers the rest by default: every rule-count claim in the docs tree, found
   * by shape rather than by address, so the cost of a new doc stating a count is
   * zero and the cost of forgetting one is zero too.
   *
   * Two conventions make a sweep safe, and both are documented in
   * `packages/audit/AGENTS.md` where a rule is added:
   *
   * - **A bare count means the whole catalogue**, `N core rules` means the core
   *   alone, and a count of any other subset carries a qualifier that says so.
   *   That is ordinary English rather than a notation to remember, which is the
   *   point — the guard reads the sentence the way a reader does.
   * - **A historical count is frozen where it stands**, with
   *   `<!-- rule-count-frozen: N — why -->` directly under the paragraph that
   *   states it. It names its number rather than its line, because the sentence
   *   this was written for holds a frozen count and a live one in the same
   *   breath and only one of them may rot. The reason is mandatory: an undated
   *   number nobody can place is what a marker would otherwise manufacture.
   */
  describe('swept across every doc that states one', () => {
    const claims = sweptDocs().flatMap(countClaimsIn);
    const expected = { catalogue: CATALOGUE.rules.length, core: CORE_RULESET.rules.length };

    it('matches the ruleset the claim names, wherever the claim lives', () => {
      const wrong = claims
        .filter((claim) => !claim.frozen && claim.claimed !== expected[claim.names])
        .map(
          (claim) =>
            `${claim.at} claims ${claim.claimed}, but the ${claim.names} holds ${expected[claim.names]}`,
        );

      expect(
        wrong,
        'a rule count in the docs no longer matches the ruleset. Correct the number — or, if it records what the catalogue held at some past moment, freeze it where it stands with a `<!-- rule-count-frozen: N — why -->` directly under the paragraph that states it. A count of some subset of the rules is written with a qualifier ("the serving family’s seven"), never as a bare "N rules", which reads to every reader — this guard included — as the total. The conventions are in packages/audit/AGENTS.md.',
      ).toEqual([]);
    });

    it('still recognises the claim in each doc it was written knowing about', () => {
      const stating = new Set(claims.map((claim) => claim.at.split(':')[0]));

      // Vacuity is this guard's failure mode, not a false alarm: a sweep that
      // matches nothing passes forever. These four state a count today, so if
      // one drops out, the wording moved and took the guard with it.
      for (const doc of [
        'docs/movar-audit-rules.md',
        'docs/movar-audit.md',
        'docs/movar-audit-dogfood-targets.md',
        'packages/audit/AGENTS.md',
      ]) {
        expect(
          [...stating],
          `${doc} no longer states a rule count in a shape this sweep recognises — either the wording moved, or the sweep stopped reaching the file`,
        ).toContain(doc);
      }
    });

    it('freezes a count only with a marker that says why, over a number the prose still states', () => {
      expect(
        sweptDocs().flatMap(brokenMarkersIn),
        'a frozen-count marker has outlived the claim it froze, or never justified it. A stale entry is how a guard goes quiet: delete the marker, or point it at the number the prose above it actually states.',
      ).toEqual([]);
    });
  });
});
