/**
 * Synthetic `Evidence` builders. No network, no DOM, no jsdom — the whole point
 * of the collection/adjudication split is that the kernel is testable from
 * plain objects.
 *
 * Lives under `test/` rather than `src/` because production modules carry no
 * test scaffolding (no `*ForTest`, no `__internal`).
 */

import { EVIDENCE_SCHEMA_VERSION } from '../src/evidence';
import type {
  CookiePosture,
  DocumentEvidence,
  Evidence,
  HeadEvidence,
  PageEvidence,
  PickerEvidence,
  ProbeEvidence,
  Vantage,
} from '../src/evidence';

export const LOCAL_VANTAGE: Vantage = { id: 'local', kind: 'local' };

/** A proxy whose country claim was independently confirmed. */
export const VERIFIED_UA_VANTAGE: Vantage = {
  id: 'kyiv-proxy',
  kind: 'proxy',
  country: { claimed: 'UA', verified: true },
};

/** A vantage that *says* Germany. A claim, never a measurement. */
export const CLAIMED_DE_VANTAGE: Vantage = {
  id: 'berlin-proxy',
  kind: 'proxy',
  country: { claimed: 'DE' },
};

const EMPTY_DOCUMENT: DocumentEvidence = {
  htmlLang: 'uk',
  langAttributes: [],
  alternates: [],
  picker: null,
  links: [],
  textNodes: [],
};

export function makeDocument(overrides: Partial<DocumentEvidence> = {}): DocumentEvidence {
  return { ...EMPTY_DOCUMENT, ...overrides };
}

/**
 * A collected-but-empty head. Distinct from omitting `head` entirely, which is
 * what a `schemaVersion` 1 bundle looks like — the rules must tell those apart,
 * so the fixtures must be able to build both.
 */
export function makeHead(overrides: Partial<HeadEvidence> = {}): HeadEvidence {
  return { declarations: [], texts: [], ...overrides };
}

export function makePicker(overrides: Partial<PickerEvidence> = {}): PickerEvidence {
  return {
    nodePath: 'body > nav > ul.lang',
    kind: 'anchor-list',
    activeLabel: 'uk',
    options: [],
    ...overrides,
  };
}

export function makePage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return {
    id: 'page-1',
    url: 'https://example.com.ua/uk/',
    reach: 'requested',
    rendered: false,
    document: makeDocument(),
    ...overrides,
  };
}

/** A build-file page: a `path`, never a `url`. */
export function makeBuildPage(overrides: Partial<PageEvidence> = {}): PageEvidence {
  return {
    id: 'page-1',
    path: 'uk/index.html',
    reach: 'requested',
    rendered: false,
    document: makeDocument(),
    ...overrides,
  };
}

export function makeProbe(overrides: Partial<ProbeEvidence> = {}): ProbeEvidence {
  return {
    id: 'probe-1',
    pageId: 'page-1',
    url: 'https://example.com.ua/uk/',
    acceptLanguage: 'uk',
    vantage: LOCAL_VANTAGE,
    cookieState: 'cold',
    outcome: 'ok',
    status: 200,
    responseHeaders: {},
    redirectChain: [],
    ...overrides,
  };
}

/**
 * `cookies` is omitted rather than defaulted, because absent is a real state on
 * the wire: a bundle written before `schemaVersion` 6 declares no posture at
 * all, which is what most of these fixtures should look like.
 */
export function networkEvidence(
  pages: readonly PageEvidence[],
  probes: readonly ProbeEvidence[] = [],
  cookies?: CookiePosture,
): Evidence {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: {
      kind: 'network',
      vantage: LOCAL_VANTAGE,
      probes,
      robots: 'honoured',
      ...(cookies === undefined ? {} : { cookies }),
    },
    collectedAt: '2026-08-13T09:00:00.000Z',
    collector: { id: 'test-collector', version: '0.0.0' },
    pages,
  };
}

export function filesystemEvidence(pages: readonly PageEvidence[]): Evidence {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    source: { kind: 'filesystem', root: '/build/dist' },
    collectedAt: '2026-08-13T09:00:00.000Z',
    collector: { id: 'test-collector', version: '0.0.0' },
    pages,
  };
}
