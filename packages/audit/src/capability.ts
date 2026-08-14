/**
 * Capabilities are **derived from the shape of `Evidence`**, structurally.
 *
 * A rule declares what a collector must have produced; the kernel answers
 * `not-collected` when that capability is absent. No rule hand-checks for
 * missing data, and `not-collected` is never `pass` — which is the whole
 * defence against the default failure mode of every audit tool, silently
 * passing what it did not check.
 *
 * Two exclusions are structural rather than conditional:
 *
 * - `ProbeEvidence` lives on the `network` branch of `EvidenceSource`, so
 *   `http` / `matrix` / `multi-vantage` are unreachable on a filesystem build.
 * - A `blocked` or `error` probe is dropped by {@link adjudicableProbes} before
 *   capabilities are derived, so a run that only met a WAF interstitial reports
 *   `not-collected`, never `pass`.
 */

import type { Evidence, ProbeEvidence } from './evidence';

/** What a collector must have produced for a rule to be adjudicable. */
export type Capability =
  /** HTML alone — works on `filesystem` evidence. */
  | 'static'
  /** A real response: status, headers, redirect chain. */
  | 'http'
  /** ≥2 probes differing only in `Accept-Language`. */
  | 'matrix'
  /** Permission to follow declared targets — fetched, or read from the build. */
  | 'traversal'
  /** ≥2 vantages. */
  | 'multi-vantage'
  /** Rendered tier — a live DOM. */
  | 'browser'
  /** A page set (filesystem build, or capped sitemap expansion). */
  | 'site';

/*
 * A single-element `capabilities` array is declared, verbatim, in most rule
 * files — one rule family per collector requirement. Naming the common ones
 * here, rather than in each of five rule files, is what keeps
 * `['static']`/`['site']`/`['traversal']` from drifting into a typo one file
 * over (a rule that means `'site'` but writes `'sites'` fails `not-collected`
 * silently, since the array is typed `readonly Capability[]`, not a literal).
 */

/** HTML alone is enough — works on `filesystem` evidence. */
export const STATIC_ONLY: readonly Capability[] = ['static'];
/** Needs the whole collected page set. */
export const SITE_ONLY: readonly Capability[] = ['site'];
/** Permission to follow a declared target — fetched, or read from the build. */
export const TRAVERSAL_ONLY: readonly Capability[] = ['traversal'];

/** ≥2 of anything is what every "differential" capability needs. */
const DIFFERENTIAL_MINIMUM = 2;

/**
 * The probes a rule is allowed to see. A `blocked` probe is an interstitial
 * that returned HTTP 200 with its own `<html lang>` and its own body text;
 * adjudicating one manufactures a false accusation about a named company, so
 * nothing downstream of it is adjudicated. An `error` probe observed nothing.
 */
export function adjudicableProbes(evidence: Evidence): readonly ProbeEvidence[] {
  if (evidence.source.kind !== 'network') return [];
  return evidence.source.probes.filter((probe) => probe.outcome === 'ok');
}

/**
 * The matrix key: everything a matrix leg holds identical, so the only thing
 * varying within a leg is `Accept-Language`.
 *
 * Exported because the serving rules must group probes **exactly** the way the
 * capability that admitted them did. Two definitions of "same leg" would let a
 * rule adjudicate probes the `matrix` capability never certified as comparable
 * — which is how a tool that names companies ends up comparing a Kyiv response
 * against a Frankfurt one and publishing the difference as a defect.
 */
export function matrixLegKey(probe: ProbeEvidence): string {
  return `${probe.url} ${probe.vantage.id} ${probe.cookieState}`;
}

/**
 * The key standing in for the no-preference leg, which has no header value of
 * its own. Exported because the serving rules group by the same sentinel: two
 * spellings would put the no-preference leg in a different bucket there than
 * the capability that admitted the matrix put it in.
 *
 * The leading space cannot collide with a real `Accept-Language`, which never
 * starts with whitespace once parsed.
 */
export const NO_PREFERENCE_KEY = ' none';

/** ≥2 probes on one URL, one vantage, one cookie state, different headers. */
function hasResponseMatrix(probes: readonly ProbeEvidence[]): boolean {
  const legs = new Map<string, Set<string>>();
  for (const probe of probes) {
    const key = matrixLegKey(probe);
    const headers = legs.get(key) ?? new Set<string>();
    headers.add(probe.acceptLanguage ?? NO_PREFERENCE_KEY);
    legs.set(key, headers);
  }
  for (const headers of legs.values()) {
    if (headers.size >= DIFFERENTIAL_MINIMUM) return true;
  }
  return false;
}

function hasMultipleVantages(probes: readonly ProbeEvidence[]): boolean {
  const vantages = new Set(probes.map((probe) => probe.vantage.id));
  return vantages.size >= DIFFERENTIAL_MINIMUM;
}

/**
 * `traversal` is permission to follow a declared target. On a build that is
 * free — the next file is right there. Over the network it means the collector
 * actually fetched a target the page's own markup declared.
 */
function hasTraversal(evidence: Evidence): boolean {
  if (evidence.source.kind === 'filesystem') return evidence.pages.length > 0;
  return evidence.pages.some((page) => page.reach === 'declared-target');
}

/**
 * Derive the capability set from the evidence's shape alone. Pure; the same
 * bundle always yields the same set, which is what makes a stored report
 * re-adjudicate identically.
 */
export function deriveCapabilities(evidence: Evidence): ReadonlySet<Capability> {
  const probes = adjudicableProbes(evidence);
  const capabilities = new Set<Capability>();

  if (evidence.pages.length > 0) capabilities.add('static');
  if (evidence.pages.length >= DIFFERENTIAL_MINIMUM) capabilities.add('site');
  if (evidence.pages.some((page) => page.rendered)) capabilities.add('browser');
  if (hasTraversal(evidence)) capabilities.add('traversal');
  if (probes.length > 0) capabilities.add('http');
  if (hasResponseMatrix(probes)) capabilities.add('matrix');
  if (hasMultipleVantages(probes)) capabilities.add('multi-vantage');

  return capabilities;
}

/** The capabilities a rule declared that this evidence does not provide. */
export function missingCapabilities(
  required: readonly Capability[],
  available: ReadonlySet<Capability>,
): readonly Capability[] {
  return required.filter((capability) => !available.has(capability));
}
