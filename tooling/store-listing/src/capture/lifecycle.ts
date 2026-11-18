/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, unicorn/no-array-reverse, sonarjs/no-misleading-array-reverse -- orchestration: prints progress, unwinds cleanups in reverse */
/**
 * What the capture scripts share around their `main()`: a stack of cleanups
 * that unwinds once (in reverse) on exit or on SIGINT/SIGTERM/SIGHUP, and the
 * runner that reports a failure as an exit code and always cleans up.
 */
export type CleanupFn = () => Promise<void> | void;

export interface Lifecycle {
  readonly cleanups: CleanupFn[];
  run: (main: () => Promise<void>) => void;
}

export function createLifecycle(): Lifecycle {
  const cleanups: CleanupFn[] = [];
  let cleaning: Promise<void> | null = null;
  const cleanup = async (): Promise<void> => {
    cleaning ??= (async () => {
      for (const fn of cleanups.reverse()) {
        try {
          await fn();
        } catch (error) {
          console.error('cleanup step failed:', error);
        }
      }
    })();
    return cleaning;
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      void cleanup().finally(() => process.exit(130));
    });
  }
  return {
    cleanups,
    run: (main) => {
      void main()
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : error);
          process.exitCode = 1;
        })
        .finally(async () => cleanup());
    },
  };
}
