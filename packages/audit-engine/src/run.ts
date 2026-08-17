/**
 * One audit, end to end: collect → adjudicate → `Report`.
 *
 * The two invariants `docs/movar-audit.md` puts on the audit hold here exactly
 * as they held in the WebView tab, and for the same reasons:
 *
 * - **It does not judge.** The verdict comes from `evaluate()`, the pure kernel
 *   the CLI runs. This module hands it `Evidence` and returns what it said. That
 *   is what lets a site owner re-run the same bundle and get the same answer —
 *   and it is why a native shell rendering the result changes nothing.
 * - **It does not fetch.** Collection goes through the injected probe, into the
 *   host's own network layer.
 */
import { CORE_RULESET, evaluate, UA_PACK_FAMILIES, withPack } from '@movar/audit';
import type { Evidence } from '@movar/audit/evidence';
import type { Report } from '@movar/audit/report';
import { collectMatrix } from './collect';
import type { ProbeTransport } from './protocol';
import { ENGINE_ID, ENGINE_VERSION } from './version';

export interface RunAuditOptions {
  readonly url: string;
  readonly probe: ProbeTransport;
  readonly collectorId: string;
  /**
   * Whether to adjudicate against the `ua` jurisdiction pack.
   *
   * Opt-in, and never defaulted on by a host: applying Law 2704-VIII to a site
   * outside its scope would be a false legal accusation.
   */
  readonly uaPack: boolean;
  readonly headers?: readonly (string | null)[];
  readonly runId?: string;
  readonly now?: string;
  readonly onProgress?: (done: number, total: number) => void;
}

/** A finished audit. `evidence` travels with the report so a shell can export
 *  the replayable bundle without asking for it again. */
export interface AuditResult {
  readonly report: Report;
  readonly evidence: Evidence;
}

export async function runAudit(options: RunAuditOptions): Promise<AuditResult> {
  const evidence = await collectMatrix({
    url: options.url,
    probe: options.probe,
    collectorId: options.collectorId,
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
  });

  const ruleset = options.uaPack ? withPack(CORE_RULESET, ...UA_PACK_FAMILIES) : CORE_RULESET;
  // Always stamped, with no way for a host to suppress it. A shell hands this
  // report straight to a person who may come back to it much later, and
  // "re-adjudicate this evidence" is unanswerable without the build that
  // reached the verdicts — the same argument the ruleset stamp already won.
  // Unlike the collector, this is not the host's to declare: the host did not
  // build the engine and could only guess at its version.
  const engine = { id: ENGINE_ID, version: ENGINE_VERSION };
  return { report: evaluate(evidence, ruleset, engine), evidence };
}
