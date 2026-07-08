import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { EmptyResultsRetry } from '../sites/types';
import {
  RETRY_SETTLE_DELAY_MS,
  maybeScheduleEmptyResultsRetry,
  resetEmptyResultsRetryState,
  retryTargetUrl,
} from './empty-results-retry';
import type { EmptyResultsRetryDeps } from './empty-results-retry';

const RETRY: EmptyResultsRetry = {
  dropParam: 'lr',
  containerSelector: '#search',
  resultsSelector: '#search a h3',
};

const EMPTY_SERP_URL =
  'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5+%D0%BD%D0%B0%D0%BF%D1%80%D1%83%D0%B3%D0%B8&hl=uk&lr=lang_uk%7Clang_en';

/** Deps stub around a mutable page: selector counts, a href that `replace`
 *  updates, a loop-guard set backed by `markAttempt`, and settle control.
 *  `whenSettled` defaults to "already settled" (runs the callback now);
 *  `settled: false` captures callbacks into `settleCallbacks` for manual
 *  release, driving the wait-for-load path. */
interface StubDeps extends EmptyResultsRetryDeps {
  counts: Record<string, number>;
  attempted: Set<string>;
  settleCallbacks: (() => void)[];
  setHref(href: string): void;
  replace: Mock<(url: string) => void>;
  record: Mock<EmptyResultsRetryDeps['record']>;
  whenSettled: Mock<EmptyResultsRetryDeps['whenSettled']>;
}

function makeDeps(
  options: {
    href?: string;
    counts?: Record<string, number>;
    settled?: boolean;
    active?: boolean;
  } = {},
): StubDeps {
  const { href = EMPTY_SERP_URL, settled = true, active = true } = options;
  const counts = options.counts ?? { [RETRY.containerSelector]: 1, [RETRY.resultsSelector]: 0 };
  const attempted = new Set<string>();
  const settleCallbacks: (() => void)[] = [];
  const location = { href, replace: vi.fn() };
  const replace = location.replace.mockImplementation((url: string) => {
    location.href = url;
  });
  const deps: StubDeps = {
    location,
    counts,
    attempted,
    settleCallbacks,
    replace,
    setHref: (next) => {
      location.href = next;
    },
    countMatches: (selector) => counts[selector] ?? 0,
    whenSettled: vi.fn((fn: () => void) => {
      if (settled) fn();
      else settleCallbacks.push(fn);
    }),
    recentlyAttemptedHere: (h) => attempted.has(h),
    markAttempt: (h) => attempted.add(h),
    record: vi.fn(async () => {}),
    isActive: () => active,
  };
  return deps;
}

async function elapseSettleDelay(): Promise<void> {
  await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetEmptyResultsRetryState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retryTargetUrl', () => {
  it('drops exactly the filter param, keeping q and hl', () => {
    const target = retryTargetUrl(EMPTY_SERP_URL, 'lr');
    expect(target).not.toBeNull();
    const url = new URL(target!);
    expect(url.searchParams.has('lr')).toBe(false);
    expect(url.searchParams.get('hl')).toBe('uk');
    expect(url.searchParams.get('q')).toBe('реле напруги');
  });

  it('returns null when the filter param is absent (nothing to retry)', () => {
    expect(retryTargetUrl('https://www.google.com/search?q=a&hl=uk', 'lr')).toBeNull();
  });
});

describe('maybeScheduleEmptyResultsRetry', () => {
  it('retries a settled empty SERP once without the filter param', async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();

    expect(deps.replace).toHaveBeenCalledTimes(1);
    const target = new URL(deps.replace.mock.calls[0]![0]);
    expect(target.searchParams.has('lr')).toBe(false);
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('q')).toBe('реле напруги');
  });

  it('marks BOTH the empty URL and the retried URL in the loop guard', async () => {
    // The FROM mark makes this page once-only; the target mark is what stops
    // the enforce rewrite from re-adding the filter on the retried page.
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();

    expect(deps.attempted.has(EMPTY_SERP_URL)).toBe(true);
    expect(deps.attempted.has(deps.replace.mock.calls[0]![0])).toBe(true);
  });

  it("records a 'search-retry' correction before navigating", async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();

    expect(deps.record).toHaveBeenCalledExactlyOnceWith('search-retry', 'uk', 'uk');
    // record → navigate ordering, same as tryStrategySwitch: the event must be
    // written before the page unloads.
    expect(deps.record.mock.invocationCallOrder[0]!).toBeLessThan(
      deps.replace.mock.invocationCallOrder[0]!,
    );
  });

  it('does nothing when the filter param is absent', async () => {
    const deps = makeDeps({
      href: 'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5&hl=uk',
    });
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await vi.runAllTimersAsync();

    expect(deps.whenSettled).not.toHaveBeenCalled();
    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('does nothing on a healthy SERP (organic results present)', async () => {
    const deps = makeDeps({ counts: { '#search': 1, '#search a h3': 9 } });
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await vi.runAllTimersAsync();

    expect(deps.whenSettled).not.toHaveBeenCalled();
    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('does not retry when the results container never rendered', async () => {
    // Absent container = "not a results page / not rendered", never "empty" —
    // interstitials and half-loaded documents must not trigger a navigation.
    const deps = makeDeps({ counts: { '#search': 0, '#search a h3': 0 } });
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await vi.runAllTimersAsync();

    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('never retries the same URL twice (loop-guard marker)', async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();
    expect(deps.replace).toHaveBeenCalledTimes(1);

    // Back on the empty URL (back button / reload): still marked, no retry.
    deps.setHref(EMPTY_SERP_URL);
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await vi.runAllTimersAsync();
    expect(deps.replace).toHaveBeenCalledTimes(1);
  });

  it('arms a single confirm for a burst of ticks on the same URL', async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();

    expect(deps.whenSettled).toHaveBeenCalledTimes(1);
    expect(deps.replace).toHaveBeenCalledTimes(1);
  });

  it('bails when results arrive between schedule and confirm (late render)', async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    deps.counts[RETRY.resultsSelector] = 7;
    await vi.runAllTimersAsync();

    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('bails when an SPA navigation swaps the URL before the confirm', async () => {
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    deps.setHref('https://www.google.com/search?q=other&hl=uk&lr=lang_uk');
    await vi.runAllTimersAsync();

    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('bails when superseded (pause/snooze/settings change) before the confirm', async () => {
    const deps = makeDeps({ active: false });
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await vi.runAllTimersAsync();

    expect(deps.replace).not.toHaveBeenCalled();
  });

  it('waits for the document to settle, then the delay, before confirming', async () => {
    const deps = makeDeps({ settled: false });
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);

    // Not settled yet: no timer armed, nothing navigates.
    await vi.runAllTimersAsync();
    expect(deps.replace).not.toHaveBeenCalled();

    // Document settles (window load) — the confirm still waits out the delay.
    for (const fn of deps.settleCallbacks) fn();
    await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS - 1);
    expect(deps.replace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(deps.replace).toHaveBeenCalledTimes(1);
  });

  it('re-arms on a later tick after a bailed confirm', async () => {
    // First pass: results appear late → confirm bails without marking.
    const deps = makeDeps();
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    deps.counts[RETRY.resultsSelector] = 3;
    await vi.runAllTimersAsync();
    expect(deps.replace).not.toHaveBeenCalled();

    // Page empties again (SPA re-render) and a new tick arrives: the pending
    // flag was released, so the retry can arm — and this time it fires.
    deps.counts[RETRY.resultsSelector] = 0;
    maybeScheduleEmptyResultsRetry(RETRY, 'uk', deps);
    await elapseSettleDelay();
    expect(deps.replace).toHaveBeenCalledTimes(1);
  });
});
