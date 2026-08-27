/**
 * The WebView collector, made host-agnostic.
 *
 * Lifted from `apps/safari-host-app/src/audit/collect.ts`, which was written
 * against the Safari bridge directly. Two things had to become inputs for the
 * same file to serve Swift, Kotlin and C# hosts:
 *
 * - **The probe is injected** ({@link ProbeTransport}) rather than imported.
 * - **The collector id is declared by the host** rather than hardcoded to
 *   `swift-urlsession`. It is stamped into evidence for replay forensics, so a
 *   run on Android must say `okhttp` and mean it.
 *
 * Everything else is unchanged, and deliberately small. A collector shares
 * nothing with the kernel but the serializable `Evidence` it emits, so this file
 * owns exactly what is different about running inside a WebView:
 *
 * - **HTTP goes native.** The engine runs under `default-src 'self'`, so it
 *   cannot fetch. Nothing here retries, follows a redirect, or decides what a
 *   challenge page is.
 * - **The DOM is real.** `DOMParser.parseFromString` gives a genuine `Document`
 *   with the page's own `instanceof` constructors, so `digestFromDocument` runs
 *   unmodified — no jsdom, and none of the globals shim the Node collector needs.
 *   The parse is inert by construction: no script executes and no subresource
 *   loads, which is what makes it safe to point at a hostile page.
 *
 * The reply from the host is treated as **untrusted input**. `Evidence` is a
 * published contract a site owner may re-adjudicate; a malformed field must
 * degrade to a recorded `error` probe, never crash the run and never silently
 * become a finding.
 */
import { EVIDENCE_SCHEMA_VERSION } from '@movar/audit/evidence';
import type { Evidence, ProbeEvidence, RedirectHop } from '@movar/audit/evidence';
import {
  createPageSet,
  documentHeadersOf,
  finalUrlOf,
  LOCAL_VANTAGE,
} from '@movar/audit/collect/assemble';
import type { PageSet } from '@movar/audit/collect/assemble';
import { digestFromDocument } from '@movar/audit/collect/digest-dom';
import type { ProbeReply, ProbeTransport } from './protocol';

/**
 * The matrix legs, matching the Node collector's `DEFAULT_MATRIX_HEADERS`. The
 * same URL fetched N times varying **only** `Accept-Language`, everything else
 * identical, so the differential is valid even when the absolute is not.
 */
export const MATRIX_HEADERS: readonly (string | null)[] = [null, 'uk', 'ru', 'en', 'de'];

/**
 * Requests one audit may spend, matching the CLI's `DEFAULT_REQUEST_BUDGET` so
 * every runtime presents the same posture to a site owner reading their logs.
 * The native side clamps anything larger regardless, so this is a request, not
 * an authority.
 */
export const AUDIT_BUDGET = 40;

/** Identifies the collector build in the evidence stamp, for replay forensics. */
const COLLECTOR_VERSION = '1';

export interface CollectOptions {
  readonly url: string;
  /** How this run reaches the network. Always the host's; never a `fetch`. */
  readonly probe: ProbeTransport;
  /**
   * What the host's prober is, stamped into `Evidence.collector`. Declared per
   * platform (`swift-urlsession`, `okhttp`, `winrt-http`) because a replayed
   * bundle has to say which implementation produced it.
   */
  readonly collectorId: string;
  readonly headers?: readonly (string | null)[];
  /** Injected so the evidence stamp is deterministic under test. */
  readonly now?: string;
  /** Groups this run's probes for the native budget. */
  readonly runId?: string;
  /**
   * Called after each leg settles, with how many of how many are done.
   *
   * A matrix is several real requests against a live site, each of which may
   * walk a redirect chain at a 15s timeout per hop — a run can legitimately take
   * minutes. Without this a shell can only swap a button label, which leaves the
   * person unable to tell a slow site from a wedged app.
   */
  readonly onProgress?: (done: number, total: number) => void;
}

/**
 * The host answered nothing at all — no native handler, or a dropped reply.
 *
 * Distinguished from a probe that failed, because the two mean opposite things:
 * a failed probe is a fact about the site, while this is a fact about the app.
 */
export class ProbeUnavailableError extends Error {
  constructor() {
    super('the native probe did not answer — an audit cannot run outside the app');
    this.name = 'ProbeUnavailableError';
  }
}

/** Parse HTML into a digest. Inert: no script runs, no subresource loads. */
function digest(html: string, options: Parameters<typeof digestFromDocument>[1]) {
  return digestFromDocument(new DOMParser().parseFromString(html, 'text/html'), options);
}

/** A redirect chain, keeping only hops whose three fields are all well-formed. */
function redirectChainOf(reply: ProbeReply): readonly RedirectHop[] {
  const raw: unknown = reply.redirectChain;
  if (!Array.isArray(raw)) return [];
  return (raw as readonly unknown[]).flatMap((entry): readonly RedirectHop[] => {
    if (entry === null || typeof entry !== 'object') return [];
    const { url, status, location } = entry as Record<string, unknown>;
    if (typeof url !== 'string' || typeof location !== 'string') return [];
    if (typeof status !== 'number') return [];
    return [{ url, status, location }];
  });
}

/** Header maps are indexed by lower-case name; drop anything not string→string. */
function headersOf(reply: ProbeReply): Readonly<Record<string, string>> {
  const raw: unknown = reply.responseHeaders;
  if (raw === null || typeof raw !== 'object') return {};
  const record: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') record[name.toLowerCase()] = value;
  }
  return record;
}

/**
 * The outcome, narrowed to the three the kernel knows.
 *
 * Anything unrecognised — including a native refusal — becomes `error`, which
 * the kernel drops before any rule sees it. That is the safe direction: an
 * unknown outcome must never be adjudicated as if the site had answered.
 */
function outcomeOf(reply: ProbeReply): ProbeEvidence['outcome'] {
  if (reply.refused !== undefined) return 'error';
  if (reply.outcome === 'ok' || reply.outcome === 'blocked') return reply.outcome;
  return 'error';
}

/**
 * Run the response matrix against one URL and return a replayable bundle.
 *
 * Sequential by construction — the loop awaits each leg — which is what the
 * network posture requires and what makes the native budget meaningful. Throws
 * {@link ProbeUnavailableError} only when the host answers *nothing*; a site
 * that refuses to answer produces `error` probes and a real report that says so.
 */
export async function collectMatrix(options: CollectOptions): Promise<Evidence> {
  const runId = options.runId ?? `run-${String(Date.now())}`;
  const pages = createPageSet(digest);
  const probes: ProbeEvidence[] = [];
  let answered = false;

  const headers = options.headers ?? MATRIX_HEADERS;
  for (const [index, acceptLanguage] of headers.entries()) {
    const reply = await options.probe({
      url: options.url,
      acceptLanguage,
      runId,
      budget: AUDIT_BUDGET,
    });
    const id = `probe-${String(index + 1)}`;
    if (reply === undefined) {
      // No native answer. Recorded so the bundle still says how many legs were
      // attempted, rather than looking like a shorter matrix was planned.
      probes.push(errorProbe(id, options.url, acceptLanguage));
    } else {
      answered = true;
      probes.push(probeFrom(id, options.url, acceptLanguage, reply, pages));
    }
    // Reported for a refused leg too: the run is one step further along either
    // way, and a bar that stalled on a site's first refusal would look wedged.
    options.onProgress?.(index + 1, headers.length);
  }

  if (!answered) throw new ProbeUnavailableError();

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { kind: 'network', vantage: LOCAL_VANTAGE, probes, robots: 'not-applicable' },
    collectedAt: options.now ?? new Date().toISOString(),
    collector: { id: options.collectorId, version: COLLECTOR_VERSION },
    pages: pages.pages(),
  };
}

/** A leg the host never answered. Never `blocked` — that is a site's answer. */
function errorProbe(id: string, url: string, acceptLanguage: string | null): ProbeEvidence {
  return {
    id,
    url,
    acceptLanguage,
    vantage: LOCAL_VANTAGE,
    cookieState: 'cold',
    outcome: 'error',
    status: 0,
    responseHeaders: {},
    redirectChain: [],
  };
}

/**
 * The observation itself, with every field narrowed off the untrusted reply.
 *
 * Separate from {@link probeFrom} so that "what did the network do?" and "which
 * page did that produce?" are two readable questions rather than one long one.
 */
function observationFrom(
  id: string,
  url: string,
  acceptLanguage: string | null,
  reply: ProbeReply,
): ProbeEvidence {
  return {
    id,
    url,
    acceptLanguage,
    vantage: LOCAL_VANTAGE,
    cookieState: reply.cookieState === 'warm' ? 'warm' : 'cold',
    outcome: outcomeOf(reply),
    status: typeof reply.status === 'number' ? reply.status : 0,
    responseHeaders: headersOf(reply),
    redirectChain: redirectChainOf(reply),
    ...(typeof reply.bodyHash === 'string' ? { bodyHash: reply.bodyHash } : {}),
  };
}

/**
 * Where this leg's body actually came from.
 *
 * The requested URL may 302 to the locale it prefers, so the page a leg produced
 * is the chain's destination, not the URL we asked for — digesting the redirect
 * stub instead would make `core/serving-declared-never-served` claim a language
 * is never served when it plainly is. A host that reports `finalUrl` is
 * believed; `finalUrlOf` derives the same thing from the recorded chain, which
 * covers a host build that does not send it.
 */
function landingUrlOf(reply: ProbeReply, observation: ProbeEvidence): string {
  const reported = reply.finalUrl;
  if (typeof reported === 'string' && reported !== '') return reported;
  return finalUrlOf(observation);
}

/** One observed leg, plus the page its body produced when it produced one. */
function probeFrom(
  id: string,
  url: string,
  acceptLanguage: string | null,
  reply: ProbeReply,
  pages: PageSet,
): ProbeEvidence {
  const observation = observationFrom(id, url, acceptLanguage, reply);

  // A host is expected to withhold a non-`ok` body, but the check is repeated
  // rather than trusted: digesting a challenge interstitial is how a false
  // accusation about a named company gets built, and this side assembles
  // `Evidence`.
  if (observation.outcome !== 'ok' || typeof reply.body !== 'string') return observation;

  // The whole header bag, and the bag belonging to the response that served
  // THIS body: `Link` and `Content-Language` are head declarations the digest
  // folds in, and `responseHeaders` is the FIRST response's by contract. The
  // native probers record only that one today, so `documentHeadersOf` answers
  // `undefined` for a leg that redirected and the destination is digested with
  // no header declarations rather than the redirect's — an uncollected
  // alternate is a gap, one taken off another resource is an accusation.
  //
  // Closing that gap is a two-part change and neither part is here yet: a
  // `finalResponseHeaders` field on `ProbeReply` (`./protocol.ts`), and a line
  // in `observationFrom` that narrows it onto the observation the way
  // `responseHeaders` and `bodyHash` are narrowed. A host that starts sending
  // the field today is silently dropped — `observationFrom` builds
  // `ProbeEvidence` from a fixed list and never looks at it — so a native
  // prober must not be taught to send it before both parts land.
  const headers = documentHeadersOf(observation);
  const pageId = pages.add({
    url: landingUrlOf(reply, observation),
    body: reply.body,
    reach: 'requested',
    // The status the page set refuses an error document on. `observationFrom`
    // reads `0` for a reply that states none, which is refused too — a body
    // whose status this side cannot read is a body it cannot call a page.
    status: observation.status,
    ...(headers === undefined ? {} : { headers }),
    // The host hashes the decoded text with the same rule `probe.ts` uses, so
    // page identity matches across runtimes. Falling back to the body itself
    // keeps the dedupe correct (if verbose) when a host sends no hash.
    identity: observation.bodyHash ?? reply.body,
  });

  // `null` is the page set refusing an error document — a 404's own template is
  // not a version of the page that was asked for. The observation still carries
  // the status, the headers and the chain, so the bundle says what was seen.
  return pageId === null ? observation : { ...observation, pageId };
}
