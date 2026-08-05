/**
 * Tests for the chrome-ai engine. Stubs `globalThis.LanguageDetector` with a
 * fake API. Covers:
 *  - All four availability() states translated correctly
 *  - The never-trigger-download invariant (create() never called from
 *    isAvailable, and never called when state is downloadable/downloading)
 *  - Session reuse across detect() calls (cached singleton)
 *  - Corpus run against a stub that mimics Chrome's confidence-array shape
 *  - Rejecting Chrome's raw 'und' and any other unrecognized language code
 *    even when confidence clears the threshold (issue #305)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURES } from '../../test/fixtures';
import type { LanguageFixture } from '../../test/fixtures';
import { formatFailureMessage } from '../../test/format-fixture-failure';
import { createChromeAiEngine } from './chrome-ai';
import type { LanguageDetectionEngine } from '../engine';

type AvailabilityState = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LanguageDetectorResult {
  detectedLanguage: string;
  confidence: number;
}

function installStub(opts: {
  availability: AvailabilityState | (() => AvailabilityState);
  detect?: (text: string) => LanguageDetectorResult[];
  onCreate?: () => void;
}): {
  availabilitySpy: ReturnType<typeof vi.fn>;
  createSpy: ReturnType<typeof vi.fn>;
  detectSpy: ReturnType<typeof vi.fn>;
} {
  // Sync stubs: the engine `await`s every call, so returning the value directly
  // mocks the async `LanguageDetector` API faithfully (await on a non-promise
  // resolves to it) while keeping the spies free of async-without-await bodies.
  const availabilitySpy = vi.fn(() =>
    typeof opts.availability === 'function' ? opts.availability() : opts.availability,
  );
  const detectSpy = vi.fn((text: string) =>
    opts.detect ? opts.detect(text) : [{ detectedLanguage: 'en', confidence: 0.99 }],
  );
  const createSpy = vi.fn(() => {
    opts.onCreate?.();
    return { detect: detectSpy };
  });
  (globalThis as unknown as { LanguageDetector: unknown }).LanguageDetector = {
    availability: availabilitySpy,
    create: createSpy,
  };
  return { availabilitySpy, createSpy, detectSpy };
}

function uninstallStub(): void {
  delete (globalThis as unknown as { LanguageDetector?: unknown }).LanguageDetector;
}

let chromeAiEngine: LanguageDetectionEngine;

beforeEach(() => {
  chromeAiEngine = createChromeAiEngine();
});

afterEach(() => {
  uninstallStub();
});

describe('chromeAiEngine.isAvailable', () => {
  it('returns false synchronously when LanguageDetector is missing', () => {
    uninstallStub();
    // The sync path matters — non-Chrome browsers should not pay a promise
    // round-trip per orchestrator iteration.
    expect(chromeAiEngine.isAvailable()).toBe(false);
  });

  it("returns true only for availability() === 'available'", async () => {
    installStub({ availability: 'available' });
    await expect(chromeAiEngine.isAvailable()).resolves.toBe(true);
  });

  it("returns false for 'downloadable' — never triggers the model download", async () => {
    const { createSpy } = installStub({ availability: 'downloadable' });
    await expect(chromeAiEngine.isAvailable()).resolves.toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("returns false for 'downloading'", async () => {
    const { createSpy } = installStub({ availability: 'downloading' });
    await expect(chromeAiEngine.isAvailable()).resolves.toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("returns false for 'unavailable'", async () => {
    const { createSpy } = installStub({ availability: 'unavailable' });
    await expect(chromeAiEngine.isAvailable()).resolves.toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('caches the result across subsequent calls (no extra availability() probes)', async () => {
    const { availabilitySpy } = installStub({ availability: 'available' });
    await chromeAiEngine.isAvailable();
    await chromeAiEngine.isAvailable();
    await chromeAiEngine.isAvailable();
    expect(availabilitySpy).toHaveBeenCalledTimes(1);
  });

  it('caches a negative result too — no thundering herd retrying availability()', async () => {
    const { availabilitySpy } = installStub({ availability: 'unavailable' });
    await chromeAiEngine.isAvailable();
    await chromeAiEngine.isAvailable();
    await chromeAiEngine.isAvailable();
    expect(availabilitySpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a transient availability() failure — a later probe can still succeed', async () => {
    // The browser's availability() can reject transiently (model subsystem not
    // ready). A thrown probe must NOT be remembered as "unavailable forever";
    // the next call re-checks and can flip to available.
    let attempt = 0;
    installStub({
      availability: () => {
        attempt += 1;
        if (attempt === 1) throw new Error('transient availability failure');
        return 'available';
      },
    });
    await expect(chromeAiEngine.isAvailable()).rejects.toThrow('transient availability failure');
    await expect(chromeAiEngine.isAvailable()).resolves.toBe(true);
  });
});

describe('chromeAiEngine.detect — session reuse and never-download', () => {
  it('lazily creates the session on first detect, reuses it after', async () => {
    const { createSpy, detectSpy } = installStub({ availability: 'available' });
    await chromeAiEngine.detect('Today is a good day.', {});
    await chromeAiEngine.detect('Heute ist ein schöner Tag.', {});
    await chromeAiEngine.detect("Aujourd'hui est un beau jour.", {});
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(detectSpy).toHaveBeenCalledTimes(3);
  });

  it('does not call create() during isAvailable() — opportunistic only', async () => {
    const { createSpy } = installStub({ availability: 'available' });
    await chromeAiEngine.isAvailable();
    await chromeAiEngine.isAvailable();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('returns null on confidence below the threshold (mixed-language plurality)', async () => {
    installStub({
      availability: 'available',
      detect: () => [
        { detectedLanguage: 'en', confidence: 0.45 },
        { detectedLanguage: 'de', confidence: 0.4 },
        { detectedLanguage: 'fr', confidence: 0.15 },
      ],
    });
    const result = await chromeAiEngine.detect('mixed-language text', {});
    expect(result).toBeNull();
  });

  it('returns a DetectedLanguage shape with engine id when confidence clears threshold', async () => {
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'uk', confidence: 0.98 }],
    });
    const result = await chromeAiEngine.detect('Сьогодні гарний день.', {});
    expect(result).toEqual({ language: 'uk', confidence: 0.98, engine: 'chrome-ai' });
  });

  it("rejects Chrome's raw 'und' (undetermined) as a positive detection, even above the confidence threshold", async () => {
    // Regression test for #305: chrome-ai used to return 'und' verbatim once
    // confidence cleared the threshold, so an undetermined result won as a
    // positive detection instead of being treated as "no detection" like franc.
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'und', confidence: 0.95 }],
    });
    const result = await chromeAiEngine.detect('some ambiguous or mixed-signal text', {});
    expect(result).toBeNull();
  });

  it('rejects a language code outside the known set even above the confidence threshold', async () => {
    installStub({
      availability: 'available',
      // Not a real BCP-47 tag — stands in for anything KNOWN_LANGUAGE_CODES
      // doesn't recognize, mirroring how franc-core rejects an unmapped code.
      detect: () => [{ detectedLanguage: 'zz', confidence: 0.95 }],
    });
    const result = await chromeAiEngine.detect('some text sample', {});
    expect(result).toBeNull();
  });

  it('respects ctx.maxChars by slicing the text before handing it to the session', async () => {
    const calls: string[] = [];
    installStub({
      availability: 'available',
      detect: (text) => {
        calls.push(text);
        return [{ detectedLanguage: 'en', confidence: 0.99 }];
      },
    });
    await chromeAiEngine.detect('a'.repeat(5000), { maxChars: 100 });
    expect(calls[0]).toHaveLength(100);
  });

  it('treats confidence exactly at the 0.6 threshold as confident (>= not >)', async () => {
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'en', confidence: 0.6 }],
    });
    const result = await chromeAiEngine.detect('hello there friend, how are you', {});
    expect(result).toEqual({ language: 'en', confidence: 0.6, engine: 'chrome-ai' });
  });

  it('returns null when the model yields no candidates (empty result array)', async () => {
    installStub({ availability: 'available', detect: () => [] });
    expect(await chromeAiEngine.detect('hello there friend, how are you', {})).toBeNull();
  });

  it('does not cache a failed session create() — a later detect() can still succeed', async () => {
    // create() can reject (model load failure). The engine must not poison its
    // session cache; the next detect() retries create() and can succeed.
    let creates = 0;
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'uk', confidence: 0.95 }],
      onCreate: () => {
        creates += 1;
        if (creates === 1) throw new Error('model create failed');
      },
    });
    await expect(chromeAiEngine.detect('Сьогодні гарний день у місті', {})).rejects.toThrow(
      'model create failed',
    );
    const result = await chromeAiEngine.detect('Сьогодні гарний день у місті', {});
    expect(result).toEqual({ language: 'uk', confidence: 0.95, engine: 'chrome-ai' });
  });

  it('propagates a session detect() failure so the orchestrator can fall through', async () => {
    installStub({
      availability: 'available',
      detect: () => {
        throw new Error('inference failed');
      },
    });
    await expect(chromeAiEngine.detect('hello there friend, how are you', {})).rejects.toThrow(
      'inference failed',
    );
  });
});

describe('chromeAiEngine.detect — AbortSignal / time budget (#292)', () => {
  it('returns null on an already-aborted signal, without ever calling the model', async () => {
    const { createSpy, detectSpy } = installStub({ availability: 'available' });
    const result = await chromeAiEngine.detect('hello there friend, how are you', {
      signal: AbortSignal.abort(),
    });
    expect(result).toBeNull();
    // getSession() still runs (and create() with it) so the session keeps
    // warming for the next tick, per content-runtime.ts's TIER7_TIMEOUT_MS
    // comment — only the model's own detect() call is skipped.
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(detectSpy).not.toHaveBeenCalled();
  });

  it('abstains (null), not a hang, when the signal aborts while getSession() is in flight', async () => {
    const createSpy = vi.fn(async () => new Promise<never>(() => {}));
    (globalThis as unknown as { LanguageDetector: unknown }).LanguageDetector = {
      availability: () => 'available',
      create: createSpy,
    };
    const ctrl = new AbortController();
    const pending = chromeAiEngine.detect('hello there friend, how are you', {
      signal: ctrl.signal,
    });
    ctrl.abort();
    await expect(pending).resolves.toBeNull();
  });

  it('abstains (null), not a hang, when the signal aborts while session.detect() is in flight', async () => {
    installStub({
      availability: 'available',
      // The stub's `detect` option is synchronous per installStub's contract,
      // so simulate a hung model by installing a session directly whose
      // detect() returns a promise that never settles.
    });
    (
      globalThis as unknown as {
        LanguageDetector: { create: () => { detect: () => Promise<never> } };
      }
    ).LanguageDetector.create = () => ({ detect: async () => new Promise<never>(() => {}) });
    const ctrl = new AbortController();
    const pending = chromeAiEngine.detect('hello there friend, how are you', {
      signal: ctrl.signal,
    });
    ctrl.abort();
    await expect(pending).resolves.toBeNull();
  });

  it('still returns the detection on the fast path when a live (never-aborted) signal is passed', async () => {
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'uk', confidence: 0.95 }],
    });
    const ctrl = new AbortController();
    const result = await chromeAiEngine.detect('Сьогодні гарний день.', { signal: ctrl.signal });
    expect(result).toEqual({ language: 'uk', confidence: 0.95, engine: 'chrome-ai' });
  });

  it('still functions correctly on a later call after a previous call was aborted', async () => {
    installStub({
      availability: 'available',
      detect: () => [{ detectedLanguage: 'uk', confidence: 0.95 }],
    });
    await chromeAiEngine.detect('hello there friend, how are you', { signal: AbortSignal.abort() });
    const result = await chromeAiEngine.detect('Сьогодні гарний день.', {});
    expect(result).toEqual({ language: 'uk', confidence: 0.95, engine: 'chrome-ai' });
  });
});

describe('chromeAiEngine.detect — corpus', () => {
  it.each(FIXTURES)('$id', async (fixture: LanguageFixture) => {
    installStub({
      availability: 'available',
      detect: (text) => stubChromeDetect(text, fixture),
    });
    const result = await chromeAiEngine.detect(fixture.text, {});
    const actual = result?.language ?? null;
    // eslint-disable-next-line vitest/valid-expect -- vitest's expect() takes a custom failure message as its 2nd arg (verified at runtime); the rule's maxArgs:1 default is a Jest-ism
    expect(actual, formatFailureMessage(fixture, actual)).toBe(fixture.expectedEngineLanguage);
  });
});

/** Minimal stub of Chrome's detect() that returns the fixture's expected
 *  language with high confidence — exercises the engine's mapping and
 *  threshold logic without depending on the browser's real detection model.
 *  Returns no confident result when the fixture has no expected language. */
function stubChromeDetect(_text: string, fixture: LanguageFixture): LanguageDetectorResult[] {
  if (fixture.expectedEngineLanguage === null) {
    // For inputs the corpus says no engine should confidently call (empty,
    // numbers, single char), the real Chrome model also abstains. Mirror
    // that by returning a low-confidence top entry so the threshold check
    // returns null.
    return [{ detectedLanguage: 'en', confidence: 0.1 }];
  }
  return [{ detectedLanguage: fixture.expectedEngineLanguage, confidence: 0.95 }];
}
