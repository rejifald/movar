/** Pure Java-discovery decisions for Maestro (which needs Java 17+). */

export const MIN_JAVA_MAJOR = 17;

const HOMEBREW_JAVA_HOMES: readonly string[] = [
  '/opt/homebrew/opt/openjdk',
  '/opt/homebrew/opt/openjdk@27',
  '/opt/homebrew/opt/openjdk@21',
  '/opt/homebrew/opt/openjdk@17',
  '/usr/local/opt/openjdk',
];

/** Major version from `java -version` output (`version "17.0.2"`), 0 when unreadable. */
export function parseJavaMajor(text: string): number {
  return Number.parseInt(/version "(\d+)/.exec(text)?.[1] ?? '0', 10);
}

/** First Homebrew OpenJDK home for which `hasJava` holds, or null. */
export function pickJavaHome(hasJava: (home: string) => boolean): string | null {
  return HOMEBREW_JAVA_HOMES.find((home) => hasJava(home)) ?? null;
}
