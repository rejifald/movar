import { describe, expect, it } from 'vitest';
import {
  adjudicableProbes,
  deriveCapabilities,
  matrixLegKey,
  missingCapabilities,
  NO_PREFERENCE_KEY,
} from './capability';
import type { Capability } from './capability';
import {
  CLAIMED_DE_VANTAGE,
  filesystemEvidence,
  makePage,
  makeProbe,
  networkEvidence,
} from '../test/fixtures';

describe('deriveCapabilities', () => {
  it('derives static from the presence of a page', () => {
    expect([...deriveCapabilities(networkEvidence([makePage()]))]).toContain('static');
  });

  it('reports nothing at all for an empty bundle', () => {
    expect([...deriveCapabilities(networkEvidence([]))]).toEqual([]);
  });

  it('derives site from a page set, never from a single page', () => {
    const one = deriveCapabilities(filesystemEvidence([makePage()]));
    const two = deriveCapabilities(
      filesystemEvidence([makePage(), makePage({ id: 'page-2', path: 'ru/index.html' })]),
    );
    expect(one.has('site')).toBe(false);
    expect(two.has('site')).toBe(true);
  });

  it('derives browser only from a rendered page', () => {
    expect(deriveCapabilities(networkEvidence([makePage()])).has('browser')).toBe(false);
    expect(deriveCapabilities(networkEvidence([makePage({ rendered: true })])).has('browser')).toBe(
      true,
    );
  });

  it('derives traversal from a followed declared target', () => {
    expect(deriveCapabilities(networkEvidence([makePage()])).has('traversal')).toBe(false);
    expect(
      deriveCapabilities(
        networkEvidence([makePage(), makePage({ id: 'page-2', reach: 'declared-target' })]),
      ).has('traversal'),
    ).toBe(true);
  });

  it('grants traversal on a build — the next file is right there', () => {
    expect(deriveCapabilities(filesystemEvidence([makePage()])).has('traversal')).toBe(true);
  });

  it('derives matrix from two legs that differ only in Accept-Language', () => {
    const evidence = networkEvidence(
      [makePage()],
      [makeProbe(), makeProbe({ id: 'probe-2', acceptLanguage: 'ru' })],
    );
    expect(deriveCapabilities(evidence).has('matrix')).toBe(true);
  });

  it('does not call two probes on different URLs a matrix', () => {
    const evidence = networkEvidence(
      [makePage()],
      [
        makeProbe(),
        makeProbe({ id: 'probe-2', url: 'https://example.com.ua/ru/', acceptLanguage: 'ru' }),
      ],
    );
    expect(deriveCapabilities(evidence).has('matrix')).toBe(false);
  });

  it('derives multi-vantage from two distinct egresses', () => {
    const evidence = networkEvidence(
      [makePage()],
      [makeProbe(), makeProbe({ id: 'probe-2', vantage: CLAIMED_DE_VANTAGE })],
    );
    expect(deriveCapabilities(evidence).has('multi-vantage')).toBe(true);
  });

  describe('filesystem evidence', () => {
    // The exclusion is structural, not conditional: `ProbeEvidence` lives on
    // the `network` branch of the source union, so there is nowhere for a
    // filesystem bundle to put a probe.
    const capabilities = deriveCapabilities(
      filesystemEvidence([makePage(), makePage({ id: 'page-2' })]),
    );

    it.each(['http', 'matrix', 'multi-vantage'] as const)('cannot provide %s', (capability) => {
      expect(capabilities.has(capability)).toBe(false);
    });

    it('still provides the offline capabilities', () => {
      expect(capabilities.has('static')).toBe(true);
      expect(capabilities.has('site')).toBe(true);
      expect(capabilities.has('traversal')).toBe(true);
    });
  });
});

describe('adjudicableProbes', () => {
  it('drops a blocked probe — a WAF interstitial is not evidence about a site', () => {
    const evidence = networkEvidence(
      [makePage()],
      [makeProbe({ outcome: 'blocked' }), makeProbe({ id: 'probe-2', outcome: 'error' })],
    );
    expect(adjudicableProbes(evidence)).toEqual([]);
    expect(deriveCapabilities(evidence).has('http')).toBe(false);
  });

  it('returns nothing for filesystem evidence', () => {
    expect(adjudicableProbes(filesystemEvidence([makePage()]))).toEqual([]);
  });
});

describe('missingCapabilities', () => {
  it('names exactly what the collector did not produce', () => {
    const available = new Set<Capability>(['static']);
    expect(missingCapabilities(['static', 'matrix'], available)).toEqual(['matrix']);
  });
});

/**
 * The matrix key is the one definition of "these probes are comparable", and
 * the serving rules group by it too. Two spellings of it — a different
 * separator, or a re-inlined no-preference sentinel — would let a rule
 * adjudicate probes the `matrix` capability never certified as comparable,
 * which is how a tool that names companies ends up comparing a Kyiv response
 * against a Frankfurt one. Nothing pinned that before this block.
 */
describe('matrixLegKey', () => {
  it('holds url, vantage and cookie state identical — and only those', () => {
    const base = makeProbe({ url: 'https://example.com/', acceptLanguage: null });
    // The header is what varies *within* a leg, so it must not be in the key.
    expect(matrixLegKey({ ...base, acceptLanguage: 'uk' })).toBe(
      matrixLegKey({ ...base, acceptLanguage: 'de' }),
    );
  });

  it.each([
    ['url', { url: 'https://example.com/other' }],
    ['vantage', { vantage: CLAIMED_DE_VANTAGE }],
    ['cookie state', { cookieState: 'warm' as const }],
  ])('separates probes that differ in %s', (_label, difference) => {
    const base = makeProbe({ url: 'https://example.com/', acceptLanguage: 'uk' });
    expect(matrixLegKey({ ...base, ...difference })).not.toBe(matrixLegKey(base));
  });
});

describe('NO_PREFERENCE_KEY', () => {
  /**
   * The no-preference leg has no header value of its own, so it borrows this
   * sentinel. Its doc comment claims a real `Accept-Language` can never collide
   * with it; that claim is only worth making if something checks it.
   */
  it('cannot collide with a real Accept-Language value', () => {
    const realHeaders = ['uk', 'en-US', 'uk-UA,uk;q=0.9,en;q=0.8', '*', 'de', 'ru;q=0.5'];
    expect(realHeaders).not.toContain(NO_PREFERENCE_KEY);
    // Every real value is non-empty and unpadded once parsed; the sentinel is not.
    expect(NO_PREFERENCE_KEY.trim()).not.toBe(NO_PREFERENCE_KEY);
    expect(realHeaders.every((header) => header.trim() === header)).toBe(true);
  });

  /**
   * The cross-module guard: `capability.ts` decides a matrix exists and the
   * serving rules then group the same probes. If the two disagreed about the
   * no-preference leg, this evidence would derive `matrix` while the rules
   * found only a single-header group — the exact drift the shared constant
   * exists to prevent.
   */
  it('lets the no-preference leg count toward a matrix', () => {
    const url = 'https://example.com/';
    const evidence = networkEvidence(
      [makePage()],
      [
        makeProbe({ id: 'p1', url, acceptLanguage: null }),
        makeProbe({ id: 'p2', url, acceptLanguage: 'uk' }),
      ],
    );
    expect([...deriveCapabilities(evidence)]).toContain('matrix');
  });
});
