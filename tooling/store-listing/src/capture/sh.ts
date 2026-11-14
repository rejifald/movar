/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { execFileSync, spawnSync } from 'node:child_process';

/** Run a command, return stdout; throws with stderr attached on failure. */
export function out(cmd: string, args: readonly string[], env?: NodeJS.ProcessEnv): string {
  try {
    return execFileSync(cmd, [...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    });
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message: string };
    throw new Error(`${cmd} ${args.join(' ')} failed: ${String(err.stderr ?? err.message)}`, {
      cause: error,
    });
  }
}

/** Run with output streamed to the console; returns the exit status. */
export function stream(
  cmd: string,
  args: readonly string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): number {
  const result = spawnSync(cmd, [...args], {
    stdio: 'inherit',
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  return result.status ?? 1;
}

export const log = (message: string): void => {
  console.log(message);
};
