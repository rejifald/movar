import { describe, expect, it } from 'vitest';
import { adjudicableProbes, deriveCapabilities, missingCapabilities } from './capability';
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
