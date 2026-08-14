import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { collect, formatReport, parseArgs, runCli, USAGE } from './cli';
import type { Args } from './cli';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';

/** `parseArgs` answers `Args | Error`; the happy path asserts that and narrows. */
function parsed(argv: readonly string[]): Args {
  const args = parseArgs(argv);
  if (args instanceof Error) throw args;
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
