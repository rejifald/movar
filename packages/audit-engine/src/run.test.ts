import { describe, expect, it, vi } from 'vitest';
import { MATRIX_HEADERS } from './collect';
import type { ProbeReply, ProbeRequest } from './protocol';
import { runAudit } from './run';
import { ENGINE_ID, ENGINE_VERSION } from './version';

/**
 * The report's provenance, which is the one thing about a run that the host
 * cannot supply and the kernel cannot know.
 *
 * `evaluate()` is pure and has no build of its own; the native host knows what
 * it fetched with but not what engine bundle it loaded. So the stamp can only
 * be written here, and a gap here is a document that names a company and
 * declines to say which code judged it.
 */

const PAGE = '<!doctype html><html lang="uk"><body><p>Вітаємо на сайті</p></body></html>';

function ok(body: string): ProbeReply {
  return {
    status: 200,
    outcome: 'ok',
    responseHeaders: { 'content-type': 'text/html' },
    redirectChain: [],
    finalUrl: 'https://example.com/',
    bodyHash: `hash-of-${body.length}`,
    body,
    cookieState: 'cold',
  };
}

/** A host that answers every leg the same way. */
function always(reply: ProbeReply) {
  return vi
    .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
    .mockResolvedValue(reply);
}

/** A one-leg run against a host that always answers. */
const BASE = {
  url: 'https://example.com/',
  probe: always(ok(PAGE)),
  collectorId: 'test-probe',
  headers: [null],
} as const;

describe('runAudit', () => {
  it('stamps the engine that produced the report', async () => {
    const { report } = await runAudit({
      url: 'https://example.com/',
      probe: always(ok(PAGE)),
      collectorId: 'test-probe',
      uaPack: false,
      headers: [null],
    });

    expect(report.engine).toEqual({ id: ENGINE_ID, version: ENGINE_VERSION });
  });

  it('keeps the engine and the collector as two separate facts', async () => {
    // They answer different questions — which code judged, and which platform
    // fetched — and three shells hosting one engine is exactly the case that
    // collapsing them would make unsayable.
    const { report } = await runAudit({
      url: 'https://example.com/',
      probe: always(ok(PAGE)),
      collectorId: 'okhttp',
      uaPack: false,
      headers: [null],
    });

    expect(report.engine?.id).toBe(ENGINE_ID);
    expect(report.evidence.collector.id).toBe('okhttp');
  });

  it('reads `dev` where no build-time define exists, instead of throwing', () => {
    // `vitest.config.ts` carries no `define` — a bare read of the global would
    // be a `ReferenceError` that took the whole audit down. The `typeof` guard
    // is what makes an unversioned tree say so rather than fail.
    expect(ENGINE_VERSION).toBe('dev');
  });
});

describe('runAudit — options the host may or may not supply', () => {
  it('adjudicates against the ua pack when the caller opts in', async () => {
    // Opt-in on every platform: applying Law 2704-VIII to a site outside its
    // scope would be a false legal accusation, so this must be a caller's
    // choice and must actually change the ruleset when made.
    const core = await runAudit({ ...BASE, uaPack: false });
    const withUa = await runAudit({ ...BASE, uaPack: true });

    expect(core.report.results.some((result) => result.rule.startsWith('ua/'))).toBe(false);
    expect(withUa.report.results.some((result) => result.rule.startsWith('ua/'))).toBe(true);
  });

  it('honours an injected clock and run id rather than minting its own', async () => {
    // Both exist so a run is reproducible: an evidence stamp that always read
    // the wall clock could not be diffed against a stored bundle.
    const { evidence } = await runAudit({
      ...BASE,
      uaPack: false,
      now: '2026-08-14T00:00:00.000Z',
      runId: 'run-fixed',
    });
    expect(evidence.collectedAt).toBe('2026-08-14T00:00:00.000Z');
  });

  it('stamps a collectedAt of its own when the host supplies no clock', async () => {
    const { evidence } = await runAudit({ ...BASE, uaPack: false });
    expect(Number.isNaN(Date.parse(evidence.collectedAt))).toBe(false);
  });
});

describe('runAudit — the default matrix', () => {
  it('runs the full Accept-Language matrix when the host names no headers', async () => {
    // The differential the audit rests on: the same URL fetched once per
    // Accept-Language, everything else identical. A host that names no headers
    // gets that matrix, not a single leg.
    const probe = always(ok(PAGE));
    const { evidence } = await runAudit({
      url: 'https://example.com/',
      probe,
      collectorId: 'test-probe',
      uaPack: false,
    });

    expect(evidence.source.kind).toBe('network');
    expect(probe.mock.calls).toHaveLength(MATRIX_HEADERS.length);
    expect(probe.mock.calls.map(([request]) => request.acceptLanguage)).toStrictEqual([
      ...MATRIX_HEADERS,
    ]);
  });
});
