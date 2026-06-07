#!/usr/bin/env node
/**
 * Guard `// fallow-ignore-*` comments against misuse.
 *
 * fallow honours inline suppression comments unconditionally, and they have a
 * way of multiplying: a complexity ignore is cheaper to type than a refactor,
 * and a file-level ignore quietly disables a whole rule. This script keeps them
 * scarce, scoped, and justified. Policy:
 *
 *   1. Allow-list — only these rules may be silenced with an inline comment:
 *        complexity
 *      Everything else has a better mechanism: an unused export is either dropped
 *      to non-`export` (if used in-file) or deleted (if truly dead), and test
 *      duplication is excluded via `duplicates.ignore` in .fallowrc.json. Those
 *      rules are therefore NOT allowed inline.
 *   2. No file-level — `// fallow-ignore-file <rule>` is banned outright; it
 *      blinds the rule for a whole file. Silence the specific line, or move the
 *      exemption into .fallowrc.json where it is reviewable.
 *   3. Clean directive — the line must be exactly `// fallow-ignore-next-line
 *      complexity`, nothing after the rule. fallow tokenises everything after
 *      the rule name as MORE rule names, so a trailing ` -- reason` silently
 *      registers a pile of bogus rules that `stale-suppressions` then flags.
 *      (We learned this the hard way: one round of inline reasons produced 491
 *      phantom stale suppressions.)
 *   4. Reason on the line ABOVE — because of (3), the human justification lives
 *      in a normal comment directly above the directive (no blank line between).
 *      We require at least MIN_REASON_LEN characters of it. Most of these
 *      functions already carry such a comment explaining why they read better
 *      whole.
 *   5. Budgeted — at most BUDGET suppressions repo-wide. The number only ever
 *      ratchets DOWN: lower it freely as you delete ignores; raising it is a
 *      deliberate, reviewable edit to this file.
 *
 * Pairs with the config half in `.fallowrc.json` (`stale-suppressions: error`
 * deletes ignores that no longer match a finding; `suggestInlineSuppression:
 * false` stops fallow handing out new ones). Run via `pnpm check:suppressions`
 * (also folded into `pnpm validate`, lefthook pre-push, and the CI verify job).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'scripts/check-suppressions.mts';

const ALLOWED_RULES = new Set(['complexity']);
const MIN_REASON_LEN = 12;
// Ratchet: the count of inline suppressions in the tree today. Only edit this
// DOWNWARD (as you delete ignores). Raising it should be a conscious decision a
// reviewer sees in the diff — not a reflex to make the check pass. Re-synced to 39
// when this branch rebased onto main: the inherited complexity ignores put the real
// count at 39 (main carries 42), so the ratchet locks there. The prior 35 predated
// that merge.
const BUDGET = 39;

const CODE_EXT = /\.(?:[mc]?tsx?|[mc]?jsx?|astro)$/;
// A genuine directive lives in a line / block / HTML comment. Anchoring on the
// comment marker stops us from flagging the directive when it is quoted in prose
// (docs, this script's own header) or sitting inside a string literal.
const DIRECTIVE = /(?:\/\/|\/\*|\*|<!--)[ \t]*fallow-ignore-(next-line|file)\b(.*)$/;

interface Violation {
  file: string;
  line: number;
  text: string;
  problem: string;
}

/** The prose inside one comment line (markers stripped), `''` for a line that is
 *  only comment punctuation, or `null` when the line is blank or real code. */
function commentProse(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === '' || !/^(?:\/\/|\/\*|\*|<!--)/.test(trimmed)) return null;
  const text = trimmed
    .replace(/^(?:\/\/+|\/\*+|\*+|<!--)/, '')
    .replace(/(?:\*\/|--+>)\s*$/, '')
    .replace(/\*+\/?\s*$/, '')
    .trim();
  return /[a-z0-9]/i.test(text) ? text : '';
}

/**
 * The justification is the run of comment lines immediately above the directive
 * (walking up, stopping at the first blank or code line). Returns the
 * concatenated prose so a one-liner or a JSDoc block both satisfy the
 * requirement. Stacked directives don't occur in practice, so the nearest
 * comment run is simply taken as the reason.
 */
function reasonAbove(lines: string[], directiveIdx: number): string {
  const parts: string[] = [];
  for (const line of lines.slice(0, directiveIdx).reverse()) {
    const prose = commentProse(line);
    if (prose === null) break; // blank or code — the comment run ends here
    parts.push(prose);
  }
  return parts.filter(Boolean).join(' ').trim();
}

const files = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && f !== SELF && CODE_EXT.test(f));

const violations: Violation[] = [];
let count = 0;

for (const rel of files) {
  const src = readFileSync(resolve(repoRoot, rel), 'utf8');
  if (!src.includes('fallow-ignore-')) continue;
  const lines = src.split('\n');
  for (const [idx, raw] of lines.entries()) {
    const m = DIRECTIVE.exec(raw);
    if (!m) continue;
    const scope = m[1];
    const rest = (m[2] ?? '').replace(/\s*(?:\*\/|-->)\s*$/, '');
    // fallow splits the remainder on whitespace/commas into rule names — mirror
    // that so any stray word (a leaked inline reason) surfaces as a bad rule.
    const tokens = rest.split(/[\s,]+/).filter(Boolean);
    const at = { file: rel, line: idx + 1, text: raw.trim() };

    count++;

    if (scope === 'file') {
      violations.push({
        ...at,
        problem:
          'file-level suppression is banned — silence the specific line instead, or move the exemption into .fallowrc.json',
      });
    } else if (tokens.length === 0) {
      violations.push({ ...at, problem: 'blanket suppression — name the rule, e.g. `complexity`' });
    } else {
      const disallowed = tokens.filter((t) => !ALLOWED_RULES.has(t));
      if (disallowed.length) {
        violations.push({
          ...at,
          problem: `unexpected token(s) after the rule: ${disallowed.map((t) => `\`${t}\``).join(', ')}. The directive must be exactly \`// fallow-ignore-next-line complexity\` — fallow reads trailing words as more rule names. Put the reason on the line ABOVE. (allowed rules: ${[...ALLOWED_RULES].join(', ')})`,
        });
      } else if (reasonAbove(lines, idx).length < MIN_REASON_LEN) {
        violations.push({
          ...at,
          problem: `no reason — add a comment directly above this line (no blank between) explaining why the function reads better whole (>= ${MIN_REASON_LEN} chars)`,
        });
      }
    }
  }
}

const report: string[] = violations.map(
  (v) => `  ✗ ${v.file}:${v.line}\n      ${v.problem}\n      → ${v.text}`,
);
if (count > BUDGET) {
  report.push(
    `  ✗ suppression budget exceeded: ${count} inline fallow-ignore comments, budget is ${BUDGET}.\n` +
      `      Delete one (or refactor it away) before adding another; raising the budget is a deliberate edit to ${SELF}.`,
  );
}

if (report.length) {
  console.error('✗ fallow-ignore policy check failed:\n');
  console.error(report.join('\n\n'));
  console.error(`\nPolicy: ${SELF} (inline comments) + .fallowrc.json (config-level half).`);
  process.exit(1);
}

const headroom = BUDGET - count;
console.log(
  `✓ fallow-ignore policy: ${count} inline suppression${count === 1 ? '' : 's'} ` +
    `(budget ${BUDGET}, ${headroom} headroom) — all line-level, allow-listed, and justified above.`,
);
if (headroom > 0) {
  console.log(
    `  ↳ only ${count} in use; consider lowering BUDGET in ${SELF} to ${count} to lock it in.`,
  );
}
