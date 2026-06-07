import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { browser } from 'wxt/browser';
import type { DetectedLanguage, SnippetVerdict } from '@movar/lang-detect';
import { backgroundFrancEngine, classifySnippets, warmBackgroundFranc } from './lang-detect-bridge';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Spy on runtime.sendMessage as a loose mock. wxt's fake-browser types
 *  sendMessage as `Promise<void>`, but the background worker actually replies
 *  with detection results — so we widen the spy to mock a real reply. */
function spySendMessage(): MockInstance<(message: unknown) => Promise<unknown>> {
  return vi.spyOn(browser.runtime, 'sendMessage');
}

// Candidate language codes the content filter sends for classification.
const ruUk = ['ru', 'uk'];

describe('backgroundFrancEngine (tier-7 bridge)', () => {
  it('is always available with id "franc" (telemetry parity)', () => {
    expect(backgroundFrancEngine.id).toBe('franc');
    expect(backgroundFrancEngine.isAvailable()).toBe(true);
  });

  it('forwards text + maxChars to the worker and returns its DetectedLanguage verbatim', async () => {
    const reply: DetectedLanguage = { language: 'ru', confidence: 0.9, engine: 'franc' };
    const send = spySendMessage().mockResolvedValue(reply);
    const result = await backgroundFrancEngine.detect('Пример русского текста', { maxChars: 500 });
    expect(result).toEqual(reply);
    expect(send).toHaveBeenCalledWith({
      type: 'movar:detectText',
      text: 'Пример русского текста',
      maxChars: 500,
    });
  });

  it('omits maxChars from the message when the context has none', async () => {
    const send = spySendMessage().mockResolvedValue(null);
    await backgroundFrancEngine.detect('text', {});
    expect(send).toHaveBeenCalledWith({ type: 'movar:detectText', text: 'text' });
  });

  it('returns null when the worker abstains', async () => {
    spySendMessage().mockResolvedValue(null);
    expect(await backgroundFrancEngine.detect('text', {})).toBeNull();
  });

  it('returns null (does not throw) when the worker is unreachable', async () => {
    spySendMessage().mockRejectedValue(new Error('no receiver'));
    expect(await backgroundFrancEngine.detect('text', {})).toBeNull();
  });

  it('abstains when the signal aborts before the worker replies', async () => {
    const ctrl = new AbortController();
    // A reply that never arrives — only the abort can settle the race.
    spySendMessage().mockReturnValue(new Promise<never>(() => {}));
    const pending = backgroundFrancEngine.detect('text', { signal: ctrl.signal });
    ctrl.abort();
    expect(await pending).toBeNull();
  });
});

describe('classifySnippets (batch classifier bridge)', () => {
  it('returns [] without messaging for an empty batch', async () => {
    const send = spySendMessage();
    expect(await classifySnippets([], ruUk)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends ONE batched message with candidate codes and returns the verdicts in order', async () => {
    const verdicts: (SnippetVerdict | null)[] = [{ language: 'ru', margin: 0.3, rung: 3 }, null];
    const send = spySendMessage().mockResolvedValue(verdicts);
    const result = await classifySnippets(['a', 'b'], ruUk);
    expect(result).toEqual(verdicts);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'movar:classifySnippets',
      texts: ['a', 'b'],
      candidateCodes: ['ru', 'uk'],
    });
  });

  it('falls back to all-null (keep every card) when the worker errors', async () => {
    spySendMessage().mockRejectedValue(new Error('no receiver'));
    expect(await classifySnippets(['a', 'b', 'c'], ruUk)).toEqual([null, null, null]);
  });
});

describe('warmBackgroundFranc', () => {
  it('resolves quietly when the worker is not ready', async () => {
    spySendMessage().mockRejectedValue(new Error('no receiver'));
    await expect(warmBackgroundFranc()).resolves.toBeUndefined();
  });
});
