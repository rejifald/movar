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

import { writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { argv as processArgv, stdout } from 'node:process';
import { evaluate } from '../evaluate';
import type { Evidence } from '../evidence';
import type { Finding, Verdict } from '../finding';
import type { Report, RuleResult } from '../report';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '../ruleset';
import { collectFilesystem, collectNetwork } from './node';

export interface Args {
  readonly url?: string;
  readonly dist?: string;
  readonly follow: boolean;
  readonly ignoreRobots: boolean;
  readonly ua: boolean;
  readonly json?: string;
  readonly budget?: number;
}

export const USAGE =
  'usage: movar-audit --url <url> | --dist <path> [--follow] [--ignore-robots] [--ua] [--budget n] [--json out]\n';

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

export function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const [url, dist, json, budget] = [
    value('--url'),
    value('--dist'),
    value('--json'),
    value('--budget'),
  ];
  return {
    ...(url === undefined ? {} : { url }),
    ...(dist === undefined ? {} : { dist }),
    ...(json === undefined ? {} : { json }),
    ...(budget === undefined ? {} : { budget: Number(budget) }),
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

/** Exit code, so a caller (or a test) can assert without reading the process. */
export async function runCli(
  argv: readonly string[],
  write: (text: string) => void,
): Promise<number> {
  const args = parseArgs(argv);
  if (args.url === undefined && args.dist === undefined) {
    write(USAGE);
    return 1;
  }

  const evidence = await collect(args);
  const ruleset = args.ua ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
  const report = evaluate(evidence, ruleset);
  write(formatReport(report));

  if (args.json !== undefined) {
    await writeFile(args.json, JSON.stringify({ evidence, report }, null, 2), 'utf8');
    write(`wrote ${args.json}\n`);
  }
  return report.brokenPromises > 0 ? 1 : 0;
}

/**
 * Run only as the process's own entry point, so importing this module for a
 * test never launches an audit against a live site.
 */
if (processArgv[1] !== undefined && import.meta.url.endsWith(nodePath.basename(processArgv[1]))) {
  process.exitCode = await runCli(processArgv.slice(2), (text) => stdout.write(text));
}
