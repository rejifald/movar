import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, formatReport, isProcessEntryPoint, parseArgs, runCli, USAGE } from './cli';
import type { Args } from './cli';
import { evaluate } from '../evaluate';
import type { Report } from '../report';
import { CORE_RULESET } from '../ruleset';
import { filesystemEvidence, makeBuildPage } from '../../test/fixtures';

/** `parseArgs` answers `Args | Error`; the happy path asserts that and narrows. */
function parsed(argv: readonly string[]): Args {
  const args = parseArgs(argv);
  if (args instanceof Error) throw args;
  return args;
}

/** The other branch, narrowed: a refusal is only useful if it says what it refused. */
function refused(argv: readonly string[]): Error {
  const args = parseArgs(argv);
  if (!(args instanceof Error)) throw new Error(`expected '${argv.join(' ')}' to be refused`);
  return args;
}

const EN_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>english body</p></body></html>';
/** Reciprocal with EN_PAGE on purpose: a clean site, so "0 broken promises" means something. */
const UK_PAGE =
  '<html lang="uk"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>українське тіло</p></body></html>';

/** Declares a Ukrainian twin the build does not contain — one `fail`, page-scoped. */
const BROKEN_PAGE =
  '<html lang="en"><head><link rel="alternate" hreflang="uk" href="/uk/">' +
  '<link rel="alternate" hreflang="en" href="/"></head><body><p>english body</p></body></html>';

const UNRESOLVABLE = 'core/hreflang-target-unresolvable';
const REASON = 'The Ukrainian twin ships from a different build, on purpose.';

async function buildSite(): Promise<string> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-cli-'));
  await writeFile(nodePath.join(root, 'index.html'), EN_PAGE, 'utf8');
  await mkdir(nodePath.join(root, 'uk'), { recursive: true });
  await writeFile(nodePath.join(root, 'uk', 'index.html'), UK_PAGE, 'utf8');
  return root;
}

/** A one-page build with a broken promise, plus a policy file beside it. */
async function buildBrokenSite(policy?: unknown): Promise<{ root: string; policy: string }> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-cli-red-'));
  await writeFile(nodePath.join(root, 'index.html'), BROKEN_PAGE, 'utf8');
  const path = nodePath.join(tmpdir(), `movar-policy-${nodePath.basename(root)}.json`);
  if (policy !== undefined) await writeFile(path, JSON.stringify(policy), 'utf8');
  return { root, policy: path };
}

describe('parseArgs', () => {
  it('reads the source flags', () => {
    expect(parsed(['--url', 'https://example.com/']).url).toBe('https://example.com/');
    expect(parsed(['--dist', './dist']).dist).toBe('./dist');
  });

  it('defaults every switch to off', () => {
    expect(parsed([])).toEqual({ follow: false, ignoreRobots: false, ua: false });
  });

  it('reads the switches and the numeric budget', () => {
    const args = parsed(['--follow', '--ignore-robots', '--ua', '--budget', '7']);
    expect(args.follow).toBe(true);
    expect(args.ignoreRobots).toBe(true);
    expect(args.ua).toBe(true);
    expect(args.budget).toBe(7);
  });

  it('reads the suppression policy path', () => {
    expect(parsed(['--suppress', 'audit.json']).suppress).toBe('audit.json');
  });

  it('omits absent optionals rather than setting them undefined', () => {
    expect('url' in parsed([])).toBe(false);
    expect('budget' in parsed([])).toBe(false);
  });
});

/**
 * Every string that must never reach the prober as a budget: the ones `Number()`
 * turns into `NaN` or `Infinity` — which lose every comparison the ceiling is
 * made of — and the ones it quietly turns into some other number than the one
 * that was typed (`''` and `' '` into `0`, `0x10` into `16`).
 */
const NOT_A_BUDGET: readonly string[] = [
  'lots',
  'NaN',
  'Infinity',
  '',
  ' ',
  '1.5',
  '-1',
  '1e3',
  '0x10',
  '9'.repeat(400),
];

describe('parseArgs validation', () => {
  /**
   * The ceiling `probe.ts` enforces is only real if it is a number. A budget of
   * `NaN` makes `spent >= budget` false for every `spent` and `remaining()`
   * never `0`, so a typo in one flag value turns a bounded audit into an
   * unbounded one against a live third-party site.
   */
  it('rejects a budget that is not a non-negative integer, so no run gets a NaN ceiling', () => {
    for (const raw of NOT_A_BUDGET) {
      expect(parseArgs(['--dist', './dist', '--budget', raw])).toBeInstanceOf(Error);
    }
  });

  it('names the offending flag and value, since the run is refused over it', () => {
    const error = parseArgs(['--dist', './dist', '--budget', 'lots']);
    if (!(error instanceof Error)) throw new Error('expected --budget lots to be refused');
    expect(error.message).toContain('--budget');
    expect(error.message).toContain('lots');
  });

  it('accepts a plain non-negative integer, zero included', () => {
    expect(parsed(['--budget', '0']).budget).toBe(0);
    expect(parsed(['--budget', '7']).budget).toBe(7);
    expect(parsed(['--budget', '500']).budget).toBe(500);
  });

  /** `--url --follow` parsed as a url of `--follow`, and then fetched it. */
  it('rejects a flag value that is itself a flag, rather than fetching the flag', () => {
    expect(parseArgs(['--url', '--follow'])).toBeInstanceOf(Error);
    expect(parseArgs(['--dist', '--ua'])).toBeInstanceOf(Error);
    expect(parseArgs(['--suppress', '--json', 'out.json'])).toBeInstanceOf(Error);
  });

  it('rejects a value flag left dangling at the end of argv', () => {
    expect(parseArgs(['--dist', './dist', '--budget'])).toBeInstanceOf(Error);
  });

  it('leaves a value that merely contains dashes alone', () => {
    expect(parsed(['--dist', './my-dist']).dist).toBe('./my-dist');
    expect(parsed(['--url', 'https://example.com/uk-ua/']).url).toBe('https://example.com/uk-ua/');
  });
});

/**
 * An argument the parser did not know was invisible to it: it looked each known
 * flag up by name and never enumerated argv, so a typo was dropped in silence
 * and the audit ran with settings nobody asked for. `--budgt 5` audited with
 * the default budget of 40; `--folow` left the traversal off. Both govern how
 * this tool behaves toward a site that never agreed to be audited.
 */
describe('parseArgs — an argument it does not recognise', () => {
  it('refuses a misspelled value flag rather than auditing with the default it left in place', () => {
    expect(refused(['--dist', './dist', '--budgt', '5']).message).toContain('--budgt');
  });

  it('refuses a misspelled switch rather than silently running with it off', () => {
    expect(refused(['--dist', './dist', '--folow']).message).toContain('--folow');
  });

  /** A misspelled source flag used to reach the generic "no source" usage dump. */
  it('names a misspelled source flag, rather than reporting a missing source', () => {
    expect(refused(['--dsit', './dist']).message).toContain('--dsit');
  });

  /**
   * `USAGE` documents no positional argument, so a token that is not a flag and
   * not a flag's value is a mistake — a `--dist` that lost its dashes, a
   * single-dash `-budget`, a glob the shell expanded. Silence over it is the
   * same defect as silence over `--budgt`.
   */
  it('refuses a stray token, since every input this CLI takes is a flag or its value', () => {
    expect(refused(['--dist', './dist', 'extra-junk']).message).toContain('extra-junk');
    expect(refused(['--dist', './dist', '-budget', '5']).message).toContain('-budget');
  });

  /** With nothing positional to separate, `--` only names a flag that does not exist. */
  it('refuses a bare --, which ends an option list this CLI does not have', () => {
    expect(parseArgs(['--dist', './dist', '--'])).toBeInstanceOf(Error);
  });

  it('accepts every flag USAGE documents, in one command line', () => {
    expect(
      parsed([
        '--url',
        'https://example.com/',
        '--follow',
        '--ignore-robots',
        '--ua',
        '--budget',
        '7',
        '--suppress',
        'audit.json',
        '--json',
        'out.json',
      ]),
    ).toEqual({
      url: 'https://example.com/',
      json: 'out.json',
      budget: 7,
      suppress: 'audit.json',
      follow: true,
      ignoreRobots: true,
      ua: true,
    });
  });

  /** The shape `nx run marketing:audit` runs — refusing this turns `audit-site` red. */
  it('accepts the command line the dogfood gate invokes', () => {
    expect(parsed(['--dist', 'dist', '--suppress', 'audit-suppressions.json'])).toEqual({
      dist: 'dist',
      suppress: 'audit-suppressions.json',
      follow: false,
      ignoreRobots: false,
      ua: false,
    });
  });
});

describe('formatReport', () => {
  it('leads with the ruleset stamp, coverage and the headline count', async () => {
    const report = evaluate(await collect({ dist: await buildSite(), ...OFF }), CORE_RULESET);
    const text = formatReport(report);
    expect(text).toContain(`ruleset ${CORE_RULESET.id}@${CORE_RULESET.version}`);
    expect(text).toContain('coverage:');
    expect(text).toContain(`broken promises: ${report.brokenPromises}`);
  });

  it('renders failures before passes, so the eye meets them first', async () => {
    const report = evaluate(await collect({ dist: await buildSite(), ...OFF }), CORE_RULESET);
    const text = formatReport(report);
    const notCollected = text.indexOf('not-collected (');
    const pass = text.indexOf('✓ pass (');
    expect(pass).toBeGreaterThan(-1);
    expect(notCollected).toBeGreaterThan(pass);
  });

  it('names every rule that ran', async () => {
    const report = evaluate(await collect({ dist: await buildSite(), ...OFF }), CORE_RULESET);
    const text = formatReport(report);
    for (const result of report.results) expect(text).toContain(result.rule);
  });
});

/**
 * One page off a build: enough for the page-scoped rules, and short of `site`,
 * `http`, `matrix`, `multi-vantage` and `browser` — so the report carries both
 * kinds of "did not run" at once, which is the shape every real run has.
 */
function partiallyRunReport(): Report {
  return evaluate(filesystemEvidence([makeBuildPage()]), CORE_RULESET);
}

/**
 * The rules that did not run are two thirds of a typical run, and the reason
 * they did not is the only thing telling an operator whether to fix the site or
 * to go and collect more. `formatResult` printed the rule id and dropped both
 * `notApplicableReason` and `missingCapabilities`, so the largest part of the
 * report said nothing at all.
 */
describe('formatReport — why a rule did not run', () => {
  it('prints the reason a rule was not applicable, not merely its id', () => {
    const report = partiallyRunReport();
    const text = formatReport(report);
    let asserted = 0;
    for (const { notApplicableReason } of report.results) {
      if (notApplicableReason === undefined) continue;
      asserted += 1;
      expect(text).toContain(notApplicableReason);
    }
    expect(asserted).toBeGreaterThan(0);
  });

  it('prints what a not-collected rule needed, so the gap is actionable', () => {
    const report = partiallyRunReport();
    const text = formatReport(report);
    let asserted = 0;
    for (const { missingCapabilities } of report.results) {
      if (missingCapabilities === undefined) continue;
      asserted += 1;
      expect(text).toContain(`needs ${missingCapabilities.join(', ')}`);
    }
    expect(asserted).toBeGreaterThan(0);
  });

  /** On the rule's own line: a reason floating elsewhere explains nothing. */
  it('keeps the reason on the line that names the rule', () => {
    const report = partiallyRunReport();
    const text = formatReport(report);
    const skipped = report.results.find((result) => result.notApplicableReason !== undefined);
    const ungathered = report.results.find((result) => result.missingCapabilities !== undefined);
    if (skipped?.notApplicableReason === undefined) throw new Error('no not-applicable result');
    if (ungathered?.missingCapabilities === undefined) throw new Error('no not-collected result');

    expect(text).toContain(`   ${skipped.rule} — ${skipped.notApplicableReason}\n`);
    expect(text).toContain(
      `   ${ungathered.rule} — needs ${ungathered.missingCapabilities.join(', ')}\n`,
    );
  });

  /** A rule that ran has a verdict and findings; an em dash after it is noise. */
  it('adds nothing to a rule that ran', () => {
    const report = partiallyRunReport();
    const text = formatReport(report);
    let asserted = 0;
    for (const result of report.results) {
      if (result.notApplicableReason !== undefined) continue;
      if (result.missingCapabilities !== undefined) continue;
      asserted += 1;
      expect(text).toContain(`   ${result.rule}\n`);
    }
    expect(asserted).toBeGreaterThan(0);
  });
});

const OFF = { follow: false, ignoreRobots: false, ua: false } as const;

describe('runCli', () => {
  /** `2`, not `1`: the audit did not run at all, which is not the same as red. */
  it('prints usage and exits 2 when given no source', async () => {
    let out = '';
    const code = await runCli([], (text) => {
      out += text;
    });
    expect(code).toBe(2);
    expect(out).toBe(USAGE);
  });

  it('audits a build off disk and reports success when nothing is broken', async () => {
    let out = '';
    const code = await runCli(['--dist', await buildSite()], (text) => {
      out += text;
    });
    expect(out).toContain('Movar Audit');
    expect(out).toContain('broken promises: 0');
    expect(code).toBe(0);
  });

  it('writes the evidence and report together when asked for JSON', async () => {
    const root = await buildSite();
    const out = nodePath.join(root, 'report.json');
    await runCli(['--dist', root, '--json', out], () => {});

    const written: unknown = JSON.parse(
      await (await import('node:fs/promises')).readFile(out, 'utf8'),
    );
    expect(written).toHaveProperty('evidence');
    expect(written).toHaveProperty('report');
  });

  /**
   * `2`, not `0`: a command the parser refuses is a run that never happened.
   * Before this was validated the budget arrived as `NaN`, the collector ran
   * with no ceiling at all, and the CLI reported a clean audit over it.
   */
  it('exits 2 on an unusable --budget, and audits nothing', async () => {
    let out = '';
    const code = await runCli(['--dist', await buildSite(), '--budget', 'lots'], (text) => {
      out += text;
    });
    expect(code).toBe(2);
    expect(out).toContain('--budget');
    expect(out).toContain(USAGE);
    expect(out).not.toContain('Movar Audit');
  });

  /**
   * `2`, not `0`: the command the operator typed is not the one that would have
   * run. This used to audit the build with the default budget and exit green,
   * so the typo never surfaced at all.
   */
  it('exits 2 on an unknown flag, naming it, and audits nothing', async () => {
    let out = '';
    const code = await runCli(['--dist', await buildSite(), '--budgt', '5'], (text) => {
      out += text;
    });
    expect(code).toBe(2);
    expect(out).toContain('--budgt');
    expect(out).toContain(USAGE);
    expect(out).not.toContain('Movar Audit');
  });

  it('exits 2 rather than treating the next flag as a url and fetching it', async () => {
    let out = '';
    const code = await runCli(['--url', '--follow'], (text) => {
      out += text;
    });
    expect(code).toBe(2);
    expect(out).toContain('--url expects a value');
  });

  /** The `ua` pack must never run unless a caller asked for it. */
  it('adds the ua pack only under --ua', async () => {
    const root = await buildSite();
    let plain = '';
    let packed = '';
    await runCli(['--dist', root], (text) => {
      plain += text;
    });
    await runCli(['--dist', root, '--ua'], (text) => {
      packed += text;
    });
    expect(plain).not.toContain('ua/market-determination');
    expect(packed).toContain('ua/market-determination');
  });
});

async function run(argv: readonly string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await runCli(argv, (text) => {
    out += text;
  });
  return { code, out };
}

describe('runCli --suppress', () => {
  it('goes green when every broken promise is covered, and still prints them', async () => {
    const { root, policy } = await buildBrokenSite({
      budget: 1,
      suppressions: [{ rule: UNRESOLVABLE, subject: '/index.html', reason: REASON }],
    });
    const { code, out } = await run(['--dist', root, '--suppress', policy]);

    expect(code).toBe(0);
    // The finding is silenced, never hidden — the reader sees it and the reason.
    expect(out).toContain(UNRESOLVABLE);
    expect(out).toContain(REASON);
  });

  it('stays red when a broken promise is uncovered', async () => {
    const { root, policy } = await buildBrokenSite({ budget: 0, suppressions: [] });
    expect((await run(['--dist', root, '--suppress', policy])).code).toBe(1);
  });

  it('fails on a stale entry, so the file cannot become a graveyard', async () => {
    const { root, policy } = await buildBrokenSite({
      budget: 1,
      suppressions: [{ rule: 'core/hreflang-duplicate', subject: '/index.html', reason: REASON }],
    });
    const { code, out } = await run(['--dist', root, '--suppress', policy]);
    expect(code).toBe(1);
    expect(out).toContain('stale suppressions');
  });

  it('fails on a policy that breaks the doctrine, and silences nothing', async () => {
    const { root, policy } = await buildBrokenSite({
      budget: 1,
      suppressions: [{ rule: UNRESOLVABLE, reason: 'nah' }],
    });
    const { code, out } = await run(['--dist', root, '--suppress', policy]);
    expect(code).toBe(1);
    expect(out).toContain('suppression policy');
  });

  it('exits 2 when the policy file is missing or unparseable', async () => {
    const { root, policy } = await buildBrokenSite();
    expect((await run(['--dist', root, '--suppress', policy])).code).toBe(2);

    await writeFile(policy, '{ not json', 'utf8');
    const { code, out } = await run(['--dist', root, '--suppress', policy]);
    expect(code).toBe(2);
    expect(out).toContain('not valid JSON');
  });

  it('exits 2 when the policy parses but is not a policy', async () => {
    const { root, policy } = await buildBrokenSite({ budget: 'lots', suppressions: [] });
    expect((await run(['--dist', root, '--suppress', policy])).code).toBe(2);
  });

  it('prints nothing extra when no policy was given', async () => {
    const { out } = await run(['--dist', await buildSite()]);
    expect(out).not.toContain('suppressed (');
  });
});

describe('collect', () => {
  it('reads the filesystem when --dist is given', async () => {
    const evidence = await collect({ dist: await buildSite(), ...OFF });
    expect(evidence.source.kind).toBe('filesystem');
    expect(evidence.pages.length).toBeGreaterThan(0);
  });
});

/** The real module under test, addressed the way the running process addresses it. */
const CLI_URL = new URL('cli.ts', import.meta.url).href;
const CLI_PATH = fileURLToPath(CLI_URL);

/**
 * The entry points that are not this module: one that shares its basename, one
 * whose name ends with it, and a `.bin` shim symlinked to it the way a package
 * manager links a declared `bin`.
 */
async function buildEntryPoints(): Promise<{
  binShim: string;
  otherCli: string;
  auditCli: string;
  absent: string;
}> {
  const root = await mkdtemp(nodePath.join(tmpdir(), 'movar-entry-'));
  await mkdir(nodePath.join(root, '.bin'), { recursive: true });
  await mkdir(nodePath.join(root, 'tool'), { recursive: true });
  await mkdir(nodePath.join(root, 'scripts'), { recursive: true });

  const binShim = nodePath.join(root, '.bin', 'movar-audit');
  await symlink(CLI_PATH, binShim);
  const otherCli = nodePath.join(root, 'tool', 'cli.ts');
  await writeFile(otherCli, 'export {};\n', 'utf8');
  const auditCli = nodePath.join(root, 'scripts', 'audit-cli.ts');
  await writeFile(auditCli, 'export {};\n', 'utf8');

  return { binShim, otherCli, auditCli, absent: nodePath.join(root, 'gone', 'cli.ts') };
}

/**
 * The guard that decides whether importing this module audits a live site.
 *
 * It used to compare `import.meta.url` against `basename(argv[1])`, which was
 * wrong in both directions: silent under the package's own `bin` name (the CLI
 * did nothing and exited 0) and live for any unrelated process whose entry
 * script happened to be called `cli.ts`.
 */
describe('isProcessEntryPoint', () => {
  it('fires under the declared bin, whose .bin entry is a symlink to this module', async () => {
    const { binShim } = await buildEntryPoints();
    expect(isProcessEntryPoint(CLI_URL, binShim)).toBe(true);
  });

  /** The shape `nx run marketing:audit` uses — if this stops firing, CI audits nothing. */
  it('fires on a direct run of this module, which is how the dogfood gate invokes it', () => {
    expect(isProcessEntryPoint(CLI_URL, CLI_PATH)).toBe(true);
  });

  it('stays silent for an unrelated entry point that merely shares the basename', async () => {
    const { otherCli } = await buildEntryPoints();
    expect(isProcessEntryPoint(CLI_URL, otherCli)).toBe(false);
  });

  it('stays silent for an entry point whose name ends with this module name', async () => {
    const { auditCli } = await buildEntryPoints();
    expect(isProcessEntryPoint(CLI_URL, auditCli)).toBe(false);
  });

  it('stays silent when the process has no entry script at all', () => {
    const argvWithNoEntry: readonly string[] = ['node'];
    expect(isProcessEntryPoint(CLI_URL, argvWithNoEntry[1])).toBe(false);
  });

  /** Import-time code: an unresolvable entry must answer, not throw. */
  it('stays silent rather than throwing when the entry is not on disk', async () => {
    const { absent } = await buildEntryPoints();
    expect(isProcessEntryPoint(CLI_URL, absent)).toBe(false);
  });

  it('stays silent for a module URL that names no file', () => {
    expect(isProcessEntryPoint('data:text/javascript,0', CLI_PATH)).toBe(false);
  });
});
