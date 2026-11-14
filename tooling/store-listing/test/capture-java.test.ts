import { describe, expect, it } from 'vitest';
import { parseJavaMajor, pickJavaHome } from '../src/capture/java';

describe('parseJavaMajor', () => {
  it('reads the major version', () => {
    expect(parseJavaMajor('openjdk version "21.0.1" 2023-10-17')).toBe(21);
    expect(parseJavaMajor('java version "17.0.2"')).toBe(17);
  });
  it('is 0 when there is no version text', () => {
    expect(parseJavaMajor('command not found')).toBe(0);
  });
});

describe('pickJavaHome', () => {
  it('returns the first home that has a java binary', () => {
    expect(pickJavaHome((home) => home.endsWith('@21'))).toBe('/opt/homebrew/opt/openjdk@21');
  });
  it('is null when none has one', () => {
    expect(pickJavaHome(() => false)).toBeNull();
  });
});
