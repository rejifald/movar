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
import { opendir, readFile, writeFile } from 'node:fs/promises';
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

/** The flags that take none. `VALUE_FLAGS` and these are the whole language. */
const SWITCH_FLAGS = ['--follow', '--ignore-robots', '--ua'] as const;

const TAKES_VALUE: ReadonlySet<string> = new Set<string>(VALUE_FLAGS);
const KNOWN_FLAGS: ReadonlySet<string> = new Set<string>([...VALUE_FLAGS, ...SWITCH_FLAGS]);

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
 * The refusal a command earns for the first token this CLI cannot account for.
 *
 * The flags above are read by looking each one up by name, which cannot see a
 * token nobody looked for: `--budgt 5` used to audit with the default budget of
 * 40 and say nothing, and `--folow` used to leave the traversal off. Both
 * govern how this tool behaves toward a site that never agreed to be audited,
 * so argv is walked once here and anything unaccounted for refuses the run.
 *
 * A value flag accounts for the token after it — but never a `--`-leading one.
 * No value this parser produces can start with `--`: `parseArgs` refuses
 * `--url --follow` outright rather than fetching a url of `--follow`. Declining
 * to swallow one here is that same rule, and it keeps a typo visible where a
 * repeated flag discards the occurrence the refusal was checked on.
 *
 * `USAGE` documents no positional argument, so a token that is neither a flag
 * nor a value is a mistake too — a `--dist` that lost its dashes, a single-dash
 * `-budget`, a glob the shell expanded — and is refused by the same walk. So is
 * a bare `--`: with no positional arguments to separate, an end-of-options
 * marker guards nothing this CLI has.
 */
function unaccountedToken(argv: readonly string[]): Error | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    // `?? ''` only satisfies the index signature; an empty token is unknown either way.
    const token = argv[index] ?? '';
    if (!KNOWN_FLAGS.has(token)) return refusal(token);
    const value = argv[index + 1];
    if (TAKES_VALUE.has(token) && value !== undefined && !value.startsWith('--')) index += 1;
  }
  return undefined;
}

/**
 * Name an unaccounted-for token in the terms the operator can act on.
 *
 * A bare `--` gets its own sentence. It is not a flag anybody misspelled, so
 * "unknown flag '--'" answers a question that was never asked and points at no
 * fix; what is actually wrong is that an end-of-options marker separates
 * nothing here. A `--`-leading token is a flag that does not exist, and
 * anything else is an argument with no place to go — `-budget`, a glob the
 * shell expanded, a path whose `--dist` went missing.
 */
function refusal(token: string): Error {
  if (token === '--') return new Error('a bare -- separates nothing: every input here is a flag');
  const kind = token.startsWith('--') ? 'unknown flag' : 'unexpected argument';
  return new Error(`${kind} '${token}'`);
}

/**
 * Read argv, or the reason it is not a runnable command.
 *
 * Answers with an `Error` rather than throwing, like `parseSuppressionPolicy`:
 * a malformed argument is an exit code `2` — the run never happened — and
 * `runCli` stays the only place that decides that. Every token in argv has to
 * be accounted for; see `unaccountedToken` for what that costs and buys.
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

  const stray = unaccountedToken(argv);
  if (stray !== undefined) return stray;

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

/**
 * Why a rule did not run, in the kernel's own words.
 *
 * `undefined` for a rule that ran: its verdict and findings are the
 * explanation, and an em dash after every passing rule is noise. The other two
 * thirds of a typical run are the ones that need this — a `not-applicable`
 * carries the reason the rule found nothing to adjudicate, and a
 * `not-collected` carries what the collector never produced, which is the
 * difference between "fix the site" and "collect more".
 */
function formatWhy(result: RuleResult): string | undefined {
  if (result.notApplicableReason !== undefined) return result.notApplicableReason;
  if (result.missingCapabilities === undefined) return undefined;
  return `needs ${result.missingCapabilities.join(', ')}`;
}

function formatResult(result: RuleResult): string {
  const why = formatWhy(result);
  const reason = why === undefined ? '' : ` — ${why}`;
  return `   ${result.rule}${reason}\n${result.findings.map(formatFinding).join('')}`;
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

/** Grouped by verdict so the eye finds the failures without reading every line. */
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
 * The errno a failed filesystem call carries, or `undefined` for a thrown value
 * that carries none. Narrowed rather than asserted: what a `catch` binds is
 * `unknown`, and the single shape worth branching on is an `Error` whose `code`
 * is a string.
 */
function errnoOf(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  const { code } = error;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Why a `--dist` could not be read, in the operator's terms.
 *
 * The head is `readPolicy`'s own wording, because it is the same class of
 * mistake — a flag whose value names something that is not there — and the tail
 * separates the two answers that point at a fix in the command from the
 * residual that points at the machine. `ENOENT` and `ENOTDIR` are what a typo
 * and a `--dist` aimed at a file look like from the filesystem; a revoked read
 * permission, a symlink cycle and everything else fall through to the plain
 * refusal, which still names the path.
 */
function unreadableRoot(root: string, error: unknown): Error {
  const code = errnoOf(error);
  if (code === 'ENOENT') return new Error(`could not read ${root}: no such directory`);
  if (code === 'ENOTDIR') return new Error(`could not read ${root}: not a directory`);
  return new Error(`could not read ${root}`);
}

/**
 * Check the one path the operator typed, before anything is collected from it.
 *
 * `collectFilesystem` calls `readdir` unguarded, so a mistyped `--dist` used to
 * leave an uncaught `ENOENT` to reach the top-level `await` — and a top-level
 * rejection exits `1`, this CLI's code for "the site broke its promises". A
 * typo therefore arrived at CI wearing the exit code of a language defect,
 * which is exactly the misreading the three-valued contract exists to prevent.
 * The documented answer is `2`: the run never happened.
 *
 * A **pre-flight on that path alone**, deliberately, and never a `try` around
 * `collect()`. The errnos above are what "this argument is wrong" looks like;
 * everything the collection does afterwards — a subdirectory that will not
 * list, a file that will not read, a parse that throws — is a real defect or a
 * broken machine, and must still surface as a crash rather than be dressed up
 * as a mistyped path and exited over quietly.
 *
 * `opendir` rather than `stat`, because a directory with no read permission
 * `stat`s perfectly well and then fails the `readdir` that matters. Opening it
 * is the exact capability the walk needs, so this cannot pass where the
 * collection would fail. The handle is closed at once; the walk opens its own.
 *
 * The path is named as resolved, not as typed. `--dist dist` is the form the
 * dogfood gate invokes, and "no such directory: dist" cannot tell an operator
 * that their shell was somewhere else — which is the usual reason a relative
 * path misses.
 */
async function checkDist(dist: string): Promise<Error | undefined> {
  const root = nodePath.resolve(dist);
  try {
    await (await opendir(root)).close();
    return undefined;
  } catch (error) {
    return unreadableRoot(root, error);
  }
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
 * the parser refuses, a `--dist` that is not a readable directory, an unreadable
 * policy file. `1` means the audit is red: broken promises that no valid
 * suppression covers, a policy that breaks the doctrine, or a stale entry. The
 * two are never interchangeable: `1` accuses the site, and only an audit that
 * actually ran may do that.
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

  // No `USAGE` after this point: the command's shape was right, and a usage
  // dump under "could not read …" answers a question the operator did not ask.
  const source = args.dist === undefined ? undefined : await checkDist(args.dist);
  if (source instanceof Error) {
    write(`${source.message}\n`);
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
