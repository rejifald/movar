import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { collect, formatReport, parseArgs, runCli, USAGE } from './cli';
import { evaluate } from '../evaluate';
import { CORE_RULESET } from '../ruleset';

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
    expect(parseArgs(['--url', 'https://example.com/']).url).toBe('https://example.com/');
    expect(parseArgs(['--dist', './dist']).dist).toBe('./dist');
  });

  it('defaults every switch to off', () => {
    const args = parseArgs([]);
    expect(args).toEqual({ follow: false, ignoreRobots: false, ua: false });
  });

  it('reads the switches and the numeric budget', () => {
    const args = parseArgs(['--follow', '--ignore-robots', '--ua', '--budget', '7']);
    expect(args.follow).toBe(true);
    expect(args.ignoreRobots).toBe(true);
    expect(args.ua).toBe(true);
    expect(args.budget).toBe(7);
  });

  it('reads the suppression policy path', () => {
    expect(parseArgs(['--suppress', 'audit.json']).suppress).toBe('audit.json');
  });

  it('omits absent optionals rather than setting them undefined', () => {
    expect('url' in parseArgs([])).toBe(false);
    expect('budget' in parseArgs([])).toBe(false);
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
