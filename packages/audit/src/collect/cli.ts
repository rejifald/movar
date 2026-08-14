/**
 * A thin CLI over the Node collector: collect, adjudicate, print.
 *
 * Deliberately minimal. The ADR's product artifact is one self-contained HTML
 * file carrying the report, its evidence, and its `--replay` command; this is
 * the development harness that proves the pipeline before that artifact exists.
 * It prints what a rule decided and why, which is what makes a real run
 * diagnosable.
 *
 *   movar-audit --url https://movar.fyi/
 *   movar-audit --dist ../../apps/marketing/dist
 *   movar-audit --url https://movar.fyi/ --follow --json out.json
 *
 * Every piece is exported and the entry point only runs when this module is the
 * process's own entry — an entry point that cannot be imported cannot be
 * tested, and this one adjudicates what a published report will say.
 */

import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { argv as processArgv, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../evaluate';
import type { Evidence } from '../evidence';
import type { Finding, Verdict } from '../finding';
import type { Report, RuleResult } from '../report';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '../ruleset';
import { applySuppressions, parseSuppressionPolicy } from '../suppress';
import type { SuppressionOutcome } from '../suppress';
import { collectFilesystem, collectNetwork } from './node';

export interface Args {
  readonly url?: string;
  readonly dist?: string;
  readonly follow: boolean;
  readonly ignoreRobots: boolean;
  readonly ua: boolean;
  readonly json?: string;
  readonly budget?: number;
  readonly suppress?: string;
}

export const USAGE =
  'usage: movar-audit --url <url> | --dist <path> [--follow] [--ignore-robots] [--ua] [--budget n] [--suppress file] [--json out]\n';

/** The verdicts, worst first: a reader should meet the failures before the passes. */
const VERDICT_ORDER: readonly Verdict[] = [
  'fail',
  'warn',
  'pass',
  'not-applicable',
  'not-collected',
];

const SYMBOL: Readonly<Record<string, string>> = {
  fail: '✗',
  warn: '!',
  pass: '✓',
  'not-applicable': '–',
  'not-collected': '?',
};

/** The flags that take a value; everything else in `USAGE` is a switch. */
const VALUE_FLAGS = ['--url', '--dist', '--json', '--budget', '--suppress'] as const;

/** Digits and nothing else: `1e3`, `0x10`, `+7`, ` 7 ` and `''` are typos, not budgets. */
const DIGITS_ONLY = /^\d+$/;

/**
 * Is this a request budget at all?
 *
 * `Number('lots')` is `NaN`, and `NaN` loses every comparison it takes part in:
 * `spent >= budget` in `probe.ts` is then false for every `spent`, and
 * `Math.max(0, budget - spent)` is `NaN`, which is never `=== 0`. A typo in one
 * flag value would silently delete the hard request ceiling this tool enforces
 * on behalf of a site that never agreed to be audited — so the ceiling is
 * checked to be a number here, at the edge, and nothing downstream has to
 * defend against one that isn't. `Number.isSafeInteger` is the same guard at
 * the other end: a long enough run of digits converts to `Infinity`, which
 * defeats the ceiling exactly as `NaN` does.
 */
function isBudget(raw: string): boolean {
  return DIGITS_ONLY.test(raw) && Number.isSafeInteger(Number(raw));
}

/**
 * Read argv, or the reason it is not a runnable command.
 *
 * Answers with an `Error` rather than throwing, like `parseSuppressionPolicy`:
 * a malformed argument is an exit code `2` — the run never happened — and
 * `runCli` stays the only place that decides that.
 */
export function parseArgs(argv: readonly string[]): Args | Error {
  const values = new Map<string, string>();
  for (const flag of VALUE_FLAGS) {
    const index = argv.indexOf(flag);
    if (index === -1) continue;
    const next = argv[index + 1];
    // A flag is never its own value: `movar-audit --url --follow` must refuse,
    // not parse a url of `--follow` and then go and fetch it.
    if (next === undefined || next.startsWith('--')) return new Error(`${flag} expects a value`);
    values.set(flag, next);
  }

  const rawBudget = values.get('--budget');
  if (rawBudget !== undefined && !isBudget(rawBudget)) {
    return new Error(`--budget must be a non-negative integer, not '${rawBudget}'`);
  }
  const budget = rawBudget === undefined ? undefined : Number(rawBudget);

  const [url, dist, json, suppress] = [
    values.get('--url'),
    values.get('--dist'),
    values.get('--json'),
    values.get('--suppress'),
  ];
  return {
    ...(url === undefined ? {} : { url }),
    ...(dist === undefined ? {} : { dist }),
    ...(json === undefined ? {} : { json }),
    ...(budget === undefined ? {} : { budget }),
    ...(suppress === undefined ? {} : { suppress }),
    follow: argv.includes('--follow'),
    ignoreRobots: argv.includes('--ignore-robots'),
    ua: argv.includes('--ua'),
  };
}

function formatFinding(finding: Finding): string {
  const via = finding.via === undefined ? '' : ` [via ${finding.via}]`;
  const downgraded = finding.downgradedFrom === undefined ? '' : ' [downgraded]';
  return `      → ${finding.verdict}${via}${downgraded}: ${finding.summary}\n`;
}

function formatResult(result: RuleResult): string {
  return `   ${result.rule}\n${result.findings.map(formatFinding).join('')}`;
}

function formatHeader(report: Report): string {
  const { coverage, evidence, ruleset } = report;
  return (
    `\nMovar Audit — ruleset ${ruleset.id}@${ruleset.version}\n` +
    `evidence: ${evidence.collector.id} · ${evidence.sourceKind} · ${evidence.collectedAt}\n` +
    `coverage: ${coverage.ran} ran · ${coverage.notApplicable} n/a · ` +
    `${coverage.notCollected} not-collected\n` +
    `broken promises: ${report.brokenPromises}\n\n`
  );
}

function groupByVerdict(report: Report): ReadonlyMap<Verdict, readonly RuleResult[]> {
  const grouped = new Map<Verdict, RuleResult[]>();
  for (const result of report.results) {
    const bucket = grouped.get(result.verdict) ?? [];
    bucket.push(result);
    grouped.set(result.verdict, bucket);
  }
  return grouped;
}

/** Grouped by verdict so the eye finds the failures without reading 41 lines. */
export function formatReport(report: Report): string {
  const grouped = groupByVerdict(report);
  const sections = VERDICT_ORDER.filter((verdict) => (grouped.get(verdict) ?? []).length > 0).map(
    (verdict) => {
      const results = grouped.get(verdict) ?? [];
      const heading = `${SYMBOL[verdict] ?? '·'} ${verdict} (${results.length})\n`;
      return heading + results.map(formatResult).join('') + '\n';
    },
  );
  return formatHeader(report) + sections.join('');
}

/**
 * Render what the policy did. Suppressed findings are printed in full, never
 * hidden: a silenced accusation the reader cannot see is how a suppression file
 * turns into a graveyard.
 */
export function formatSuppressions(outcome: SuppressionOutcome): string {
  const sections: string[] = [];

  if (outcome.violations.length > 0) {
    sections.push(
      `✗ suppression policy (${outcome.violations.length})\n` +
        outcome.violations
          .map(({ suppression, problem }) => `   ${suppression?.rule ?? '(file)'}: ${problem}\n`)
          .join(''),
    );
  }
  if (outcome.stale.length > 0) {
    sections.push(
      `✗ stale suppressions (${outcome.stale.length})\n` +
        outcome.stale
          .map((entry) => `   ${entry.rule} silenced nothing in this run — delete it\n`)
          .join(''),
    );
  }
  if (outcome.suppressed.length > 0) {
    sections.push(
      `· suppressed (${outcome.suppressed.length})\n` +
        outcome.suppressed
          .map(({ finding, suppression }) => `   ${finding.rule}: ${suppression.reason}\n`)
          .join(''),
    );
  }
  return sections.length === 0 ? '' : `${sections.join('')}\n`;
}

/** Collect from whichever source the arguments name. */
export async function collect(args: Args): Promise<Evidence> {
  if (args.dist !== undefined) return collectFilesystem({ root: nodePath.resolve(args.dist) });
  return collectNetwork({
    url: args.url ?? '',
    followDeclaredTargets: args.follow,
    ignoreRobots: args.ignoreRobots,
    ...(args.budget === undefined ? {} : { budget: args.budget }),
  });
}

/**
 * Read the suppression policy, or the reason it could not be read. Kept
 * separate from applying it so an unreadable file is distinguishable from a
 * policy that is merely broken — the first is a typo in a command, the second
 * is a review failure.
 */
async function readPolicy(path: string): Promise<ReturnType<typeof parseSuppressionPolicy>> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return new Error(`could not read ${path}`);
  }
  try {
    return parseSuppressionPolicy(JSON.parse(raw));
  } catch {
    return new Error(`${path} is not valid JSON`);
  }
}

/**
 * Exit code, so a caller (or a test) can assert without reading the process.
 *
 * `2` means the run could not be completed as asked — no arguments, an argument
 * the parser refuses, an unreadable policy file. `1` means the audit is red:
 * broken promises that no valid suppression covers, a policy that breaks the
 * doctrine, or a stale entry.
 */
export async function runCli(
  argv: readonly string[],
  write: (text: string) => void,
): Promise<number> {
  const args = parseArgs(argv);
  if (args instanceof Error) {
    write(`${args.message}\n${USAGE}`);
    return 2;
  }
  if (args.url === undefined && args.dist === undefined) {
    write(USAGE);
    return 2;
  }

  const policy = args.suppress === undefined ? undefined : await readPolicy(args.suppress);
  if (policy instanceof Error) {
    write(`${policy.message}\n`);
    return 2;
  }

  const evidence = await collect(args);
  const ruleset = args.ua ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
  const report = evaluate(evidence, ruleset);
  write(formatReport(report));

  const outcome = policy === undefined ? undefined : applySuppressions(report, policy);
  if (outcome !== undefined) write(formatSuppressions(outcome));

  if (args.json !== undefined) {
    await writeFile(args.json, JSON.stringify({ evidence, report }, null, 2), 'utf8');
    write(`wrote ${args.json}\n`);
  }

  if (outcome === undefined) return report.brokenPromises > 0 ? 1 : 0;
  const red = outcome.remaining.length + outcome.violations.length + outcome.stale.length;
  return red > 0 ? 1 : 0;
}

/**
 * Is this module the script the process was started with?
 *
 * Resolved real paths, never basenames. Comparing `import.meta.url` against
 * `basename(argv[1])` was wrong in both directions at once: `…/collect/cli.ts`
 * never ends with `movar-audit`, so the declared `bin` exited 0 having audited
 * nothing; and any unrelated process whose entry script happens to be named
 * `cli.ts` matched, so importing this module launched a live audit — the exact
 * thing the guard exists to prevent.
 *
 * `realpathSync` is what makes the declared `bin` work: invoked that way
 * `argv[1]` is the `node_modules/.bin/movar-audit` shim, and only its target is
 * this file. The module side is resolved too, so both stay comparable under
 * `--preserve-symlinks`, where `import.meta.url` keeps the link path.
 *
 * Unresolvable is `false` — no `argv[1]`, an entry that is not on disk, a module
 * URL that is not a file. This runs at import time and so must not throw, and
 * not running is the safe way to be wrong: the other way audits a live site
 * nobody asked about.
 */
export function isProcessEntryPoint(importMetaUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

/**
 * Run only as the process's own entry point, so importing this module for a
 * test never launches an audit against a live site.
 */
if (isProcessEntryPoint(import.meta.url, processArgv[1])) {
  process.exitCode = await runCli(processArgv.slice(2), (text) => stdout.write(text));
}
