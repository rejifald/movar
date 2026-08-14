/**
 * A thin CLI over the Node collector: collect, adjudicate, print.
 *
 * Deliberately minimal. The ADR's product artifact is one self-contained HTML
 * file carrying the report, its evidence, and its `--replay` command; this is
 * the development harness that proves the pipeline before that artifact exists.
 * It prints what a rule decided and why, which is what makes a first real run
 * diagnosable.
 *
 *   tsx src/collect/cli.ts --url https://movar.fyi/
 *   tsx src/collect/cli.ts --dist ../../apps/marketing/dist
 *   tsx src/collect/cli.ts --url https://movar.fyi/ --follow --json out.json
 */

import { writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { evaluate } from '../evaluate';
import type { Report, RuleResult } from '../report';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '../ruleset';
import { collectFilesystem, collectNetwork } from './node';

interface Args {
  readonly url?: string;
  readonly dist?: string;
  readonly follow: boolean;
  readonly ignoreRobots: boolean;
  readonly ua: boolean;
  readonly json?: string;
  readonly budget?: number;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const budget = value('--budget');
  const url = value('--url');
  const dist = value('--dist');
  const json = value('--json');
  return {
    ...(url === undefined ? {} : { url }),
    ...(dist === undefined ? {} : { dist }),
    follow: argv.includes('--follow'),
    ignoreRobots: argv.includes('--ignore-robots'),
    ua: argv.includes('--ua'),
    ...(json === undefined ? {} : { json }),
    ...(budget === undefined ? {} : { budget: Number(budget) }),
  };
}

const SYMBOL: Readonly<Record<string, string>> = {
  pass: '✓',
  fail: '✗',
  warn: '!',
  'not-applicable': '–',
  'not-collected': '?',
};

const VERDICT_ORDER = ['fail', 'warn', 'pass', 'not-applicable', 'not-collected'] as const;

function write(line: string): void {
  process.stdout.write(line);
}

function printHeader(report: Report): void {
  write(`\nMovar Audit — ruleset ${report.ruleset.id}@${report.ruleset.version}\n`);
  write(
    `evidence: ${report.evidence.collector.id} · ${report.evidence.sourceKind} · ` +
      `${report.evidence.collectedAt}\n`,
  );
  write(
    `coverage: ${report.coverage.ran} ran · ${report.coverage.notApplicable} n/a · ` +
      `${report.coverage.notCollected} not-collected\n`,
  );
  write(`broken promises: ${report.brokenPromises}\n\n`);
}

function printResult(result: RuleResult): void {
  write(`   ${result.rule}\n`);
  for (const finding of result.findings) {
    const via = finding.via === undefined ? '' : ` [via ${finding.via}]`;
    const down = finding.downgradedFrom === undefined ? '' : ' [downgraded]';
    write(`      → ${finding.verdict}${via}${down}: ${finding.summary}\n`);
  }
}

/** Group by verdict so the eye finds the failures without reading 41 lines. */
function printReport(report: Report): void {
  const byVerdict = new Map<string, RuleResult[]>();
  for (const result of report.results) {
    byVerdict.set(result.verdict, [...(byVerdict.get(result.verdict) ?? []), result]);
  }

  printHeader(report);
  for (const verdict of VERDICT_ORDER) {
    const results = byVerdict.get(verdict) ?? [];
    if (results.length === 0) continue;
    write(`${SYMBOL[verdict] ?? '·'} ${verdict} (${results.length})\n`);
    for (const result of results) printResult(result);
    write('\n');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.url === undefined && args.dist === undefined) {
    process.stderr.write('usage: cli --url <url> | --dist <path> [--follow] [--ua] [--json out]\n');
    process.exitCode = 1;
    return;
  }

  const evidence =
    args.dist === undefined
      ? await collectNetwork({
          url: args.url ?? '',
          followDeclaredTargets: args.follow,
          ignoreRobots: args.ignoreRobots,
          ...(args.budget === undefined ? {} : { budget: args.budget }),
        })
      : await collectFilesystem({ root: nodePath.resolve(args.dist) });

  const ruleset = args.ua ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
  const report = evaluate(evidence, ruleset);
  printReport(report);

  if (args.json !== undefined) {
    await writeFile(args.json, JSON.stringify({ evidence, report }, null, 2), 'utf8');
    process.stdout.write(`wrote ${args.json}\n`);
  }
}

await main();
