/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MIN_JAVA_MAJOR, parseJavaMajor, pickJavaHome } from './java';
import { out, stream } from './sh';

const here = path.dirname(new URL(import.meta.url).pathname);
const FLOWS_DIR = path.resolve(here, '../../maestro');

/** `java -version` prints to stderr, so a failing exit may carry the text only in the error message. */
function javaVersionText(): string {
  try {
    return out('java', ['-version']);
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * Maestro 2.x needs Java 17+. Prefer the one on PATH; fall back to a Homebrew
 * OpenJDK so a Mac whose system `java` is the legacy Oracle 8 still works.
 */
function javaEnv(): NodeJS.ProcessEnv {
  if (parseJavaMajor(javaVersionText()) >= MIN_JAVA_MAJOR) return {};
  const home = pickJavaHome((candidate) => existsSync(path.join(candidate, 'bin/java')));
  if (home === null) throw new Error('Maestro needs Java 17+; install one (brew install openjdk).');
  return { JAVA_HOME: home, PATH: `${home}/bin:${process.env['PATH'] ?? ''}` };
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
