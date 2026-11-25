import { describe, expect, it } from 'vitest';
import { createProber, DEFAULT_REQUEST_BUDGET, RequestBudgetExhaustedError } from './probe';
import { LOCAL_VANTAGE } from './node';
import { stubFetch } from './probe.test-utils';

/**
 * The module doc claims the request budget is "enforced here rather than
 * trusted to callers". These pin that claim for every caller, not just the CLI
 * — `parseArgs` validates `--budget` at the edge, but the Safari host app
 * collector, a relay, or a test harness constructs a prober directly.
 */
describe('createProber option validation', () => {
  /** Never routed anywhere: construction must fail before a request exists. */
  const { fetchImpl } = stubFetch({});

  const NOT_A_COUNT: readonly number[] = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    -0.5,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  /**
   * The reported defect. Unguarded, this constructed happily and then ran
   * unbounded against a live third-party site: `spent >= NaN` is false forever,
   * so `RequestBudgetExhaustedError` never throws, and `remaining()` is `NaN`,
   * which never satisfies the collector's `if (prober.remaining() === 0) break`.
   */
  it('rejects a NaN budget at construction, since NaN silently uncaps the run', () => {
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN })).toThrow(
      TypeError,
    );
  });

  it('rejects every budget that is not a non-negative safe integer', () => {
    for (const budget of NOT_A_COUNT) {
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget })).toThrow(TypeError);
    }
  });

  /**
   * Same shape, same failure mode. A `NaN` hop cap makes `hop <= maxHops` false
   * on the first pass, so `walk` returns without fetching at all and the probe
   * reports `error` for a request nobody made; a `NaN` timeout is coerced to 1 ms
   * by `setTimeout`, aborting every request almost immediately.
   */
  it('rejects a malformed maxHops or timeoutMs on the same terms', () => {
    for (const value of NOT_A_COUNT) {
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, maxHops: value })).toThrow(
        TypeError,
      );
      expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, timeoutMs: value })).toThrow(
        TypeError,
      );
    }
  });

  /**
   * The two conditions must stay distinguishable. `RequestBudgetExhaustedError`
   * means a run reached its ceiling and a caller may legitimately catch it to
   * report partial coverage; a malformed ceiling is a bug in the caller's code,
   * and must not be swallowed by that same handler.
   */
  it('refuses a malformed budget with a TypeError, never RequestBudgetExhaustedError', () => {
    let thrown: unknown;
    try {
      createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).not.toBeInstanceOf(RequestBudgetExhaustedError);
  });

  it('names the offending option and value, since construction is refused over it', () => {
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: Number.NaN })).toThrow(
      /budget.*NaN/u,
    );
    expect(() => createProber({ vantage: LOCAL_VANTAGE, fetchImpl, maxHops: -1 })).toThrow(
      /maxHops.*-1/u,
    );
  });

  /** The point of a runtime guard on a typed API: the callers without types. */
  it('guards a caller the type system does not', () => {
    expect(() =>
      createProber({ vantage: LOCAL_VANTAGE, fetchImpl, budget: '40' as unknown as number }),
    ).toThrow(TypeError);
  });

  /**
   * Zero is a real answer for each of the three — spend nothing, follow no
   * redirect, abort at once — so the guard must be a range check and never a
   * falsy one, and an omitted option must still fall through to its default.
   */
  it('accepts zero for each option, and the defaults when they are omitted', () => {
    expect(() =>
      createProber({
        vantage: LOCAL_VANTAGE,
        fetchImpl,
        budget: 0,
        maxHops: 0,
        timeoutMs: 0,
      }),
    ).not.toThrow();

    const prober = createProber({ vantage: LOCAL_VANTAGE, fetchImpl });
    expect(prober.remaining()).toBe(DEFAULT_REQUEST_BUDGET);
  });
});
