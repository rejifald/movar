/**
 * The engine's front door — what each platform's ~20 lines of glue talk to.
 *
 * A shell wires its own channel (`webkit.messageHandlers` on Apple,
 * `addJavascriptInterface` on Android, `chrome.webview.postMessage` on Windows)
 * to {@link Engine.handle} and to an {@link EmitEvent}. Everything platform-shaped
 * stops there; nothing below this line knows which host it is running in.
 *
 * `handle` never rejects. A shell that has to distinguish "the engine threw"
 * from "the channel dropped" would have to time out every request, so a failure
 * is reported as a `failed` **event** on the same stream as a success.
 */
import { ProbeUnavailableError } from './collect';
import { catalogue, detect } from './detect';
import { applyIntent, loadSettings } from './settings';
import type { EmitEvent, EngineRequest, ProbeTransport } from './protocol';
import { runAudit } from './run';

export interface EngineOptions {
  /** How this host reaches the network. The engine has no other way out. */
  readonly probe: ProbeTransport;
  /** Stamped into `Evidence.collector` — `swift-urlsession`, `okhttp`, … */
  readonly collectorId: string;
  /** Where events go. */
  readonly emit: EmitEvent;
}

export interface Engine {
  handle: (request: EngineRequest) => Promise<void>;
}

export function createEngine(options: EngineOptions): Engine {
  return {
    handle: async (request: EngineRequest): Promise<void> => {
      try {
        await dispatch(options, request);
      } catch (error) {
        options.emit({
          kind: 'failed',
          id: request.id,
          reason: error instanceof ProbeUnavailableError ? 'probe-unavailable' : 'internal',
          // For the host's log, never for a verdict: a rule result is never
          // derived from an engine failure.
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

async function dispatch(options: EngineOptions, request: EngineRequest): Promise<void> {
  switch (request.kind) {
    case 'audit.run': {
      const { report, evidence } = await runAudit({
        url: request.url,
        probe: options.probe,
        collectorId: options.collectorId,
        uaPack: request.uaPack,
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        onProgress: (done, total) => {
          options.emit({ kind: 'audit.progress', id: request.id, done, total });
        },
      });
      options.emit({ kind: 'audit.complete', id: request.id, report, evidence });
      return;
    }
    case 'settings.load': {
      options.emit({
        kind: 'settings.state',
        id: request.id,
        settings: loadSettings(request.raw),
      });
      return;
    }
    case 'settings.apply': {
      // `current` comes back off the platform store rather than from engine
      // memory, so it is migrated before the intent lands on it — the shell may
      // have picked up a newer blob synced from another device in between.
      options.emit({
        kind: 'settings.state',
        id: request.id,
        settings: applyIntent(loadSettings(request.current), request.intent),
      });
      return;
    }
    case 'detect.run': {
      // No probe, no storage, no await — the classifier is pure and local, and
      // the detector's whole claim is that nothing leaves the device.
      options.emit({
        kind: 'detect.result',
        id: request.id,
        result: detect(request.text, request.candidates),
      });
      return;
    }
    case 'detect.catalogue': {
      options.emit({ kind: 'detect.catalogue', id: request.id, codes: catalogue() });
      return;
    }
  }
}
