/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { out, stream } from './sh';

const here = path.dirname(new URL(import.meta.url).pathname);
export const FLOWS_DIR = path.resolve(here, '../../maestro');

/**
 * Maestro 2.x needs Java 17+. Prefer the one on PATH; fall back to a Homebrew
 * OpenJDK so a Mac whose system `java` is the legacy Oracle 8 still works.
 */
export function javaEnv(): NodeJS.ProcessEnv {
  const major = (): number => {
    try {
      const text = out('java', ['-version']);
      return Number.parseInt(/version "(\d+)/.exec(text)?.[1] ?? '0', 10);
    } catch (error) {
      const stderr = (error as Error).message;
      return Number.parseInt(/version "(\d+)/.exec(stderr)?.[1] ?? '0', 10);
    }
  };
  if (major() >= 17) return {};
  for (const home of [
    '/opt/homebrew/opt/openjdk',
    '/opt/homebrew/opt/openjdk@27',
    '/opt/homebrew/opt/openjdk@21',
    '/opt/homebrew/opt/openjdk@17',
    '/usr/local/opt/openjdk',
  ]) {
    if (existsSync(path.join(home, 'bin/java'))) {
      return { JAVA_HOME: home, PATH: `${home}/bin:${process.env['PATH'] ?? ''}` };
    }
  }
  throw new Error('Maestro needs Java 17+; install one (brew install openjdk).');
}

export function availableFlows(): string[] {
  return readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.yaml'));
}

/**
 * Run one flow on one device. Returns true when every assertion in it held;
 * a failed assertion is the "wrong state" gate, so callers must fail the run.
 */
export function runFlow(
  udid: string,
  flow: string,
  env: Record<string, string>,
  debugDir: string,
): boolean {
  const file = path.join(FLOWS_DIR, `${flow}.yaml`);
  if (!existsSync(file)) throw new Error(`missing Maestro flow ${file}`);
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  const status = stream(
    process.env['MAESTRO_BIN'] ?? 'maestro',
    ['--udid', udid, 'test', ...envArgs, '--debug-output', debugDir, file],
    { env: { MAESTRO_DRIVER_STARTUP_TIMEOUT: '300000', ...javaEnv() } },
  );
  return status === 0;
}
