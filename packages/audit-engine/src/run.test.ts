import { describe, expect, it, vi } from 'vitest';
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
