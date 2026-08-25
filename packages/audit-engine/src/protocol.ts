/**
 * The native ↔ engine wire contract.
 *
 * Every Movar app surface is native (SwiftUI / Compose / WinUI 3); the audit
 * itself runs as JavaScript in an offscreen `WebView` that never renders. This
 * module is the whole boundary between those two halves — see
 * `docs/native-shells.md`.
 *
 * Two rules hold everything else up:
 *
 * - **The engine never reaches the network.** It runs under `default-src 'self'`
 *   and asks the host to fetch, so every byte of egress stays in one auditable
 *   native file that owns the declared `User-Agent`, the cold cookie state, the
 *   redirect walk and the request budget (`docs/movar-audit.md` §9). That is a
 *   property of Movar Audit on every platform, not a quirk of Safari.
 * - **The engine never renders.** It emits `Report` — data — and native decides
 *   what a rule result looks like. Consistency across platforms is a property of
 *   `evaluate()` being pure, not of two runtimes drawing the same pixels.
 *
 * Everything crossing this boundary is JSON. `ProbeReply` in particular arrives
 * from a native process and is treated as **untrusted**: `collect.ts` narrows
 * every field before it reaches `Evidence`, because `Evidence` is a published
 * contract a site owner may re-adjudicate.
 */
import type { Evidence } from '@movar/audit/evidence';
import type { Report } from '@movar/audit/report';
import type { MovarSettings } from '@movar/settings';
import type { DetectResult } from './detect';
import type { SettingsIntent } from './settings';

/**
 * Bumped when a message shape changes incompatibly.
 *
 * Three native decoders (Swift, Kotlin, C#) depend on these shapes, and they
 * ship on their own store cadences — an old shell will meet a new engine. The
 * host reports the version it was built against so the mismatch is a stated
 * refusal rather than a field silently read as `undefined`.
 */
export const ENGINE_PROTOCOL_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* The probe — engine asks, native fetches                                     */
/* -------------------------------------------------------------------------- */

/** One matrix leg the engine asks the native side to fetch. */
export interface ProbeRequest {
  readonly url: string;
  /** The `Accept-Language` to send, or `null` for the no-preference leg. */
  readonly acceptLanguage: string | null;
  /** Groups probes into one audit for the native request budget. */
  readonly runId: string;
  readonly budget?: number;
  /** Defaults to cold. A warm run is an explicit, evidence-stamped choice. */
  readonly cookieState?: 'cold' | 'warm';
}

/**
 * What the native prober observed — the **untrusted** shape of a JSON reply.
 *
 * Every field is optional because this documents a contract rather than
 * guaranteeing one; `collect.ts` validates before anything reaches `Evidence`.
 * Mirrors what `@movar/audit`'s `collect/probe.ts` emits, minus the probe `id`
 * and `vantage`, which are stamped engine-side because the native tier reports
 * only what the network did.
 */
export interface ProbeReply {
  readonly status?: number;
  readonly outcome?: string;
  /** The FIRST response's headers. */
  readonly responseHeaders?: Record<string, string>;
  readonly redirectChain?: readonly { url: string; status: number; location: string }[];
  readonly finalUrl?: string;
  readonly bodyHash?: string;
  /** Present only for an `ok` outcome; a blocked body is withheld natively. */
  readonly body?: string;
  readonly cookieState?: string;
  /** Set when the native side refused: `budget-exhausted`, `invalid-url`, … */
  readonly refused?: string;
}

/**
 * How the engine reaches the native prober.
 *
 * Resolves `undefined` when the host answered nothing at all — no handler, or a
 * dropped reply. That is deliberately distinct from a probe that failed: a failed
 * probe is a fact about the site, this is a fact about the app, and reporting the
 * first as the second would put a false observation about a named company into a
 * published document.
 */
export type ProbeTransport = (request: ProbeRequest) => Promise<ProbeReply | undefined>;

/* -------------------------------------------------------------------------- */
/* The catalogue — what sections a report has                                  */
/* -------------------------------------------------------------------------- */

/**
 * One catalogue family, as a shell needs it to lay a report out.
 *
 * The `id` is the kernel's own (`'A. Page declaration'`), which is what the
 * native title tables are keyed by — an external identifier with punctuation in
 * it, deliberately carried verbatim rather than re-slugged, so a shell's string
 * table and the engine's structure cannot disagree about what a family is
 * called.
 *
 * No title. The kernel's family titles are written for the catalogue ("Serving
 * behaviour — the Accept-Language response matrix") and are the wrong register
 * for a heading a non-technical advocate reads, so every shell wants its own
 * wording; shipping the kernel's here would offer a string nobody should render.
 */
export interface CatalogueFamily {
  readonly id: string;
  /** Rule IDs in catalogue order. */
  readonly rules: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Requests — native → engine                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `id` correlates a request with the events it produces. The host mints it; the
 * engine echoes it back on every event, so a shell that starts a second audit
 * before the first settles can tell the two streams apart.
 */
export type EngineRequest =
  | {
      readonly kind: 'audit.run';
      readonly id: string;
      readonly url: string;
      /**
       * Applying Law 2704-VIII to a site outside its scope would be a false
       * legal accusation, so the jurisdiction pack is opt-in and off by default
       * on every platform — never a host-side default.
       */
      readonly uaPack: boolean;
      /** Overrides the default matrix. Tests and replay only. */
      readonly headers?: readonly (string | null)[];
    }
  | {
      /**
       * Render one finished audit as the self-contained HTML artifact.
       *
       * The React shell called `renderReportArtifact` itself, because it could
       * import `@movar/audit`. A native shell cannot, and must not grow its own
       * renderer: the artifact is the document a site owner re-runs, so the
       * whole point is that the CLI and every shell emit the same bytes.
       *
       * `report` and `evidence` come back down rather than being remembered
       * here, which keeps the engine stateless. A shell holds a session's worth
       * of finished runs and may export any of them, including one from before
       * the engine was last reloaded — an engine-side cache would have to
       * duplicate the shell's retention policy to answer that, and would
       * silently fail whenever the two disagreed.
       */
      readonly kind: 'audit.artifact';
      readonly id: string;
      /** The `Report` from an earlier `audit.complete`, verbatim. */
      readonly report: Report;
      /** Its `Evidence`, verbatim — the artifact embeds it for replay. */
      readonly evidence: Evidence;
      /** The audited URL, as the artifact's masthead states it. */
      readonly target: string;
      /** ISO 8601 — when the run this artifact documents was made. */
      readonly generatedAt: string;
    }
  | {
      /**
       * The catalogue's shape: which families exist, in order, and which rules
       * belong to each.
       *
       * STRUCTURE, NOT STRINGS. `docs/native-shells.md` keeps display copy
       * native ("the engine emits stable rule IDs; native owns the strings"),
       * and this does not cross that line — it answers "which section does
       * `core/switch-bounces` belong in", which is a fact about the catalogue
       * rather than about a reader. `Report` cannot answer it: a `RuleResult`
       * carries no family, and the React report reconstructed the mapping by
       * importing `CORE_RULESET`. A native shell that hardcoded it instead
       * would silently mis-file every rule added after it shipped.
       *
       * Includes the jurisdiction pack unconditionally, as the React map did: a
       * report adjudicated without the pack simply never names those rules.
       */
      readonly kind: 'catalogue.describe';
      readonly id: string;
    }
  | {
      /** Raw blob out of the platform store (App Group, DataStore, …). */
      readonly kind: 'settings.load';
      readonly id: string;
      readonly raw: unknown;
    }
  | {
      readonly kind: 'settings.apply';
      readonly id: string;
      readonly current: unknown;
      readonly intent: SettingsIntent;
    }
  | {
      readonly kind: 'detect.run';
      readonly id: string;
      readonly text: string;
      /**
       * The candidate set, as bare codes.
       *
       * REQUIRED, with no host-side default, for the same reason `uaPack` is:
       * the answer is meaningless without it. A closed-set classifier asked
       * "which of these" cannot be handed an implicit "these" — a shell that
       * omitted the roster would be showing a verdict whose scope neither side
       * had stated. Ordering is the shell's and is echoed back untouched.
       */
      readonly candidates: readonly string[];
    }
  | {
      /**
       * Which codes a roster may contain — `PROFILED_CODES`, asked for rather
       * than duplicated.
       *
       * A shell needs this to draw a candidate picker, and the alternative was a
       * hand-maintained list in each of three native projects. That is the exact
       * shape of the defect this whole slice exists to remove: the detector's
       * distinctive-letter table was hand-maintained too, and it went wrong the
       * moment the set it described changed underneath it.
       */
      readonly kind: 'detect.catalogue';
      readonly id: string;
    };

/* -------------------------------------------------------------------------- */
/* Events — engine → native                                                    */
/* -------------------------------------------------------------------------- */

/** Why a request produced no result. Native renders these; it never invents one. */
export type EngineFailureReason =
  /** The host answered no probe at all — an audit cannot run here. */
  | 'probe-unavailable'
  /** The URL was not auditable. */
  | 'invalid-url'
  /** Malformed request, or one this protocol version does not know. */
  | 'bad-request'
  /** The engine threw. Carries `detail` for the log, never for a verdict. */
  | 'internal';

export type EngineEvent =
  | {
      /**
       * A matrix leg settled. Per settled leg rather than per HTTP request —
       * a leg is what the engine knows about; the native side owns the hops.
       */
      readonly kind: 'audit.progress';
      readonly id: string;
      readonly done: number;
      readonly total: number;
    }
  | {
      readonly kind: 'audit.complete';
      readonly id: string;
      readonly report: Report;
      /** Shipped alongside so the shell can export a replayable bundle. */
      readonly evidence: Evidence;
    }
  | {
      /** One rendered artifact, ready for the host's file/share layer. */
      readonly kind: 'artifact.ready';
      readonly id: string;
      /** The whole self-contained document, as one HTML string. */
      readonly html: string;
    }
  | {
      /** The catalogue's families, in catalogue order. */
      readonly kind: 'catalogue.state';
      readonly id: string;
      readonly families: readonly CatalogueFamily[];
    }
  | {
      readonly kind: 'settings.state';
      readonly id: string;
      /** Migrated and invariant-enforced. Native writes this back verbatim. */
      readonly settings: MovarSettings;
    }
  | {
      /**
       * A detection settled. Synchronous in practice — the classifier is pure
       * and local — but reported as an event anyway, because a shell that had
       * to await one request kind and subscribe to another would grow two
       * transports for one channel.
       */
      readonly kind: 'detect.result';
      readonly id: string;
      readonly result: DetectResult;
    }
  | {
      /** Every code a detector roster may contain. */
      readonly kind: 'detect.catalogue';
      readonly id: string;
      readonly codes: readonly string[];
    }
  | {
      readonly kind: 'failed';
      readonly id: string;
      readonly reason: EngineFailureReason;
      readonly detail?: string;
    };

/** Where an event goes. Each platform's glue posts it over its own channel. */
export type EmitEvent = (event: EngineEvent) => void;
