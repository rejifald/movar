import { describe, expect, it } from 'vitest';
import { retrySync, sleepSync } from '../src/capture/retry';

describe('retrySync', () => {
  it('returns the first success and sleeps only between failures', () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = retrySync(
      () => {
        calls += 1;
        if (calls < 3) throw new Error('ETIMEDOUT');
        return 'ok';
      },
      { attempts: 3, waitMs: 50, sleep: (ms) => sleeps.push(ms) },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([50, 50]);
  });

  it('rethrows the last error with the attempt count, without a trailing sleep', () => {
    const sleeps: number[] = [];
    expect(() =>
      retrySync(
        () => {
          throw new Error('code=60');
        },
        { attempts: 2, waitMs: 10, sleep: (ms) => sleeps.push(ms) },
      ),
    ).toThrow('failed after 2 attempts: code=60');
    expect(sleeps).toEqual([10]);
  });

  it('sleepSync blocks for roughly the given time', () => {
    const start = Date.now();
    sleepSync(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});
