import { afterEach, describe, expect, it } from 'vitest';
import { getCurrentColorScheme, setCurrentColorScheme } from './context';

afterEach(() => {
  setCurrentColorScheme('light');
});

describe('page-mode/context', () => {
  it('defaults to "light" on first read', () => {
    expect(getCurrentColorScheme()).toBe('light');
  });

  it('setCurrentColorScheme updates the read value', () => {
    setCurrentColorScheme('dark');
    expect(getCurrentColorScheme()).toBe('dark');
  });

  it('persists the latest set value across multiple reads', () => {
    setCurrentColorScheme('dark');
    expect(getCurrentColorScheme()).toBe('dark');
    expect(getCurrentColorScheme()).toBe('dark');
    setCurrentColorScheme('light');
    expect(getCurrentColorScheme()).toBe('light');
    expect(getCurrentColorScheme()).toBe('light');
  });

  it('can restore the default through the production setter', () => {
    setCurrentColorScheme('dark');
    setCurrentColorScheme('light');
    expect(getCurrentColorScheme()).toBe('light');
  });
});
