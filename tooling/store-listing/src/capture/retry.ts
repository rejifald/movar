/** Blocking retry for simulator commands that fail transiently under load. */

/** Synchronous sleep: the capture run is a sequential script, nothing else to schedule. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}

/**
 * Run `action` up to `attempts` times, waiting `waitMs` between tries, and
 * return its result. The last error is rethrown with the attempt count, so a
 * real failure still fails the run.
 */
export function retrySync<T>(
  action: () => T,
  {
    attempts,
    waitMs,
    sleep = sleepSync,
  }: { attempts: number; waitMs: number; sleep?: (ms: number) => void },
): T {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return action();
    } catch (error) {
      last = error;
      if (attempt < attempts) sleep(waitMs);
    }
  }
  const reason = last instanceof Error ? last.message : String(last);
  throw new Error(`failed after ${String(attempts)} attempts: ${reason}`, { cause: last });
}
