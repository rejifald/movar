import { describe, expect, it, vi } from 'vitest';
import { createEngine } from './host';
import type { EngineEvent, ProbeReply, ProbeRequest } from './protocol';

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
