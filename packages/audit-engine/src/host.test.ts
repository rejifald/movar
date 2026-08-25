import { describe, expect, it, vi } from 'vitest';
import { CORE_RULESET, UA_PACK_FAMILIES, withPack } from '@movar/audit';
import { renderReportArtifact } from '@movar/audit/artifact';
import { createEngine } from './host';
import { MATRIX_HEADERS } from './collect';
import { ENGINE_PROTOCOL_VERSION } from './protocol';
import type { EngineEvent, EngineRequest, ProbeReply, ProbeRequest } from './protocol';

/**
 * The engine's contract with a native shell.
 *
 * These drive `createEngine` through a fake probe rather than a real host,
 * because the interesting cases are the ones where the host does NOT answer the
 * happy path — a silent channel, a thrown transport. Each has a specific safe
 * direction, and getting one backwards reports a fact about the app as a fact
 * about a named company's site.
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
function always(reply: ProbeReply | undefined) {
  return vi
    .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
    .mockResolvedValue(reply);
}

function collect(): { events: EngineEvent[]; emit: (event: EngineEvent) => void } {
  const events: EngineEvent[] = [];
  return {
    events,
    emit: (event) => {
      events.push(event);
    },
  };
}

const RUN = { kind: 'audit.run', id: 'run-1', url: 'https://example.com/', uaPack: false } as const;

describe('createEngine — audit.run', () => {
  it('emits progress per settled leg, then one complete', async () => {
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ ...RUN, headers: [null, 'uk'] });

    const progress = events.filter((event) => event.kind === 'audit.progress');
    expect(progress).toHaveLength(2);
    expect(progress.at(-1)).toMatchObject({ done: 2, total: 2 });
    expect(events.at(-1)?.kind).toBe('audit.complete');
  });

  it('stamps the host-declared collector id into the evidence', async () => {
    // Replay forensics: a bundle has to say which prober produced it, so this
    // is the host's to declare rather than the engine's to assume.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'okhttp', emit });

    await engine.handle({ ...RUN, headers: [null] });

    const done = events.at(-1);
    if (done?.kind !== 'audit.complete') throw new Error('expected a complete event');
    expect(done.evidence.collector.id).toBe('okhttp');
  });

  it('reports a silent host as probe-unavailable, not as a site that failed', async () => {
    // The distinction the collector is built around: this is a fact about the
    // app, and reporting it as a fact about the site would put a false
    // observation about a named company into a published document.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(void 0), collectorId: 'test-probe', emit });

    await engine.handle({ ...RUN, headers: [null] });

    expect(events.at(-1)).toMatchObject({ kind: 'failed', reason: 'probe-unavailable' });
  });

  it('does not reject when the transport throws — the shell learns by event', async () => {
    // A shell that had to distinguish "the engine threw" from "the channel
    // dropped" would need a timeout on every request.
    const probe = vi
      .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
      .mockRejectedValue(new Error('channel closed'));
    const { events, emit } = collect();
    const engine = createEngine({ probe, collectorId: 'test-probe', emit });

    await expect(engine.handle({ ...RUN, headers: [null] })).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({ kind: 'failed', reason: 'internal' });
  });

  it('leaves the ua pack off unless the request opts in', async () => {
    // Applying Law 2704-VIII to a site outside its scope would be a false legal
    // accusation, so no host may default this on.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ ...RUN, headers: [null] });

    const done = events.at(-1);
    if (done?.kind !== 'audit.complete') throw new Error('expected a complete event');
    expect(done.report.results.some((result) => result.rule.startsWith('ua/'))).toBe(false);
  });
});

describe('createEngine — settings', () => {
  it('migrates whatever the platform store held', async () => {
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ kind: 'settings.load', id: 'req-1', raw: null });

    expect(events.at(-1)).toMatchObject({ kind: 'settings.state' });
  });

  it('applies an intent on top of the store blob, not on engine memory', async () => {
    // The shell may have picked up a newer blob synced from another device
    // between rendering the control and the person tapping it.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({
      kind: 'settings.apply',
      id: 'req-1',
      current: { schemaVersion: 1, enabled: true, priority: ['uk', 'en'] },
      intent: { kind: 'enabled.set', value: false },
    });

    const event = events.at(-1);
    if (event?.kind !== 'settings.state') throw new Error('expected a settings.state event');
    expect(event.settings.enabled).toBe(false);
    expect(event.settings.blocked).toContain('ru');
  });
});

describe('createEngine — catalogue.describe', () => {
  it('names every family in catalogue order, with the jurisdiction pack last', async () => {
    // The order IS the report's spine: a native shell sections its findings by
    // family and has no other way to learn A comes before B.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ kind: 'catalogue.describe', id: 'req-1' });

    const event = events.at(-1);
    if (event?.kind !== 'catalogue.state') throw new Error('expected a catalogue.state event');
    expect(event.families.map((family) => family.id)).toEqual([
      ...CORE_RULESET.families.map((family) => family.id),
      ...UA_PACK_FAMILIES.map((family) => family.id),
    ]);
  });

  it('files every rule the kernel ships under exactly one family', async () => {
    // A shell that cannot place a rule renders it in no section at all, so a
    // rule added to the catalogue without a family would silently vanish from
    // the findings half of every native report.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ kind: 'catalogue.describe', id: 'req-1' });

    const event = events.at(-1);
    if (event?.kind !== 'catalogue.state') throw new Error('expected a catalogue.state event');
    const filed = event.families.flatMap((family) => family.rules);
    expect(filed.toSorted()).toEqual(
      withPack(CORE_RULESET, ...UA_PACK_FAMILIES)
        .rules.map((rule) => rule.id)
        .toSorted(),
    );
    expect(new Set(filed).size).toBe(filed.length);
  });
});

describe('createEngine — audit.artifact', () => {
  it('renders the same self-contained document the CLI does', async () => {
    // Native must never grow its own renderer: the artifact is the file a site
    // owner re-runs, so every shell and the CLI have to emit the same bytes.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    await engine.handle({ ...RUN, headers: [null] });
    const done = events.at(-1);
    if (done?.kind !== 'audit.complete') throw new Error('expected a complete event');

    await engine.handle({
      kind: 'audit.artifact',
      id: 'req-2',
      report: done.report,
      evidence: done.evidence,
      target: 'https://example.com/',
      generatedAt: '2026-08-17T10:00:00.000Z',
    });

    const artifact = events.at(-1);
    if (artifact?.kind !== 'artifact.ready') throw new Error('expected an artifact.ready event');
    expect(artifact.html).toBe(
      renderReportArtifact({
        report: done.report,
        evidence: done.evidence,
        target: 'https://example.com/',
        generatedAt: '2026-08-17T10:00:00.000Z',
      }),
    );
  });
});

describe('createEngine — the edges a shell depends on', () => {
  it('answers an unknown request kind rather than leaving the shell awaiting', async () => {
    // `handle` never rejects, so a shell learns an outcome only from an event.
    // A kind this build does not know must produce a stated refusal — emitting
    // nothing would strand the caller on a reply that can never arrive.
    const { events, emit } = collect();
    const engine = createEngine({ probe: always(ok(PAGE)), collectorId: 'test-probe', emit });

    // Deliberately off-contract: this is the shape a newer shell would send.
    await engine.handle({ kind: 'audit.replay', id: 'req-1' } as unknown as EngineRequest);

    expect(events.at(-1)).toMatchObject({ kind: 'failed', id: 'req-1', reason: 'bad-request' });
  });

  it('runs the default matrix when the request names no headers', async () => {
    const probe = always(ok(PAGE));
    const { events, emit } = collect();
    const engine = createEngine({ probe, collectorId: 'test-probe', emit });

    await engine.handle(RUN);

    expect(probe.mock.calls).toHaveLength(MATRIX_HEADERS.length);
    expect(events.at(-1)?.kind).toBe('audit.complete');
  });

  it('survives a transport that rejects with something that is not an Error', async () => {
    // A native bridge can reject with whatever the platform layer threw — a
    // string, a plain object. Turning that into `[object Object]` in the detail
    // is acceptable; crashing the engine and stranding the shell is not.
    const probe = vi
      .fn<(request: ProbeRequest) => Promise<ProbeReply | undefined>>()
      .mockRejectedValue('channel closed');
    const { events, emit } = collect();
    const engine = createEngine({ probe, collectorId: 'test-probe', emit });

    await expect(engine.handle({ ...RUN, headers: [null] })).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({
      kind: 'failed',
      reason: 'internal',
      detail: 'channel closed',
    });
  });

  it('declares a protocol version, so a stale shell can refuse a new engine', () => {
    // Three native decoders ship on their own store cadences; an old shell will
    // meet a new engine, and the mismatch has to be a stated refusal rather
    // than a field silently read as undefined.
    expect(Number.isInteger(ENGINE_PROTOCOL_VERSION)).toBe(true);
    expect(ENGINE_PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});
