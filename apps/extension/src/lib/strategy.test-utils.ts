import { vi } from 'vitest';
import type { StrategyContext } from './strategy';

/**
 * Create a mock StrategyContext for testing. Cross-file helper.
 */
export function makeContext(initialUrl: string): {
  ctx: StrategyContext;
  navigate: ReturnType<typeof vi.fn>;
} {
  let url = initialUrl;
  const navigate = vi.fn((next: string) => {
    url = next;
  });
  const ctx: StrategyContext = {
    getUrl: () => new URL(url),
    navigate,
    reload: vi.fn(),
    getCookie: () => '',
    setCookie: vi.fn(),
    getStorage: () => null,
    setStorage: vi.fn(),
    clickSelector: vi.fn(() => true),
    getHreflangLinks: () => [],
  };
  return { ctx, navigate };
}
