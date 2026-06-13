/**
 * Guards the bundled-third-party attribution that ships in the extension
 * artifact. The background worker bundles franc (MIT) and its closure
 * (trigram-utils, n-gram, collapse-white-space — all MIT), and MIT requires the
 * notice to travel "in all copies." `scripts/gen-third-party-notices.mts`
 * generates `apps/extension/src/public/THIRD-PARTY-NOTICES.md`, which WXT copies
 * into the build via `publicDir`.
 *
 * This test asserts the SHIPPED copy carries the franc + trigram-utils entries
 * (plus the rest of the closure) so the generator can't silently regress and
 * the artifact can't ship un-attributed. It reads the committed file rather than
 * re-running the generator, so it also catches a stale commit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const shippedNotices = path.resolve(packageRoot, 'src/public/THIRD-PARTY-NOTICES.md');

describe('THIRD-PARTY-NOTICES (shipped attribution)', () => {
  const text = readFileSync(shippedNotices, 'utf8');

  it('attributes every bundled package in the franc closure', () => {
    for (const name of ['franc', 'trigram-utils', 'n-gram', 'collapse-white-space']) {
      expect(text).toContain(`## ${name}@`);
    }
  });

  it('carries the MIT permission notice and Titus Wormer copyright for franc + trigram-utils', () => {
    // The load-bearing MIT clause must be present...
    expect(text).toContain('Permission is hereby granted, free of charge');
    expect(text).toContain('The above copyright notice and this permission notice shall be');
    // ...and the upstream copyright holder must be credited.
    expect(text).toContain('Titus Wormer');
  });

  it('declares each entry as MIT', () => {
    const mitMarkers = text.match(/_License: MIT_/g) ?? [];
    expect(mitMarkers.length).toBeGreaterThanOrEqual(4);
  });

  it('is the generated file, not a hand-maintained list', () => {
    expect(text).toContain('GENERATED FILE — do not edit by hand');
  });
});
