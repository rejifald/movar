/**
 * Guards the bundled-third-party attribution that ships in the extension
 * artifact. Two closures are bundled: the background worker bundles franc (MIT)
 * and its closure (trigram-utils, n-gram, collapse-white-space — all MIT), and
 * the popup/options UI bundles the React runtime (react, react-dom, scheduler —
 * MIT), the Lucide icon set (lucide, lucide-react — ISC), and the @fontsource
 * web fonts (OFL-1.1). MIT/ISC require the notice to travel "in all copies";
 * OFL-1.1 adds reserved-font-name + same-name-redistribution clauses.
 * `scripts/gen-third-party-notices.mts` generates
 * `apps/extension/src/public/THIRD-PARTY-NOTICES.md`, which WXT copies into the
 * build via `publicDir`.
 *
 * This test asserts the SHIPPED copy carries the franc closure entries and the
 * UI runtime entries (react/lucide/@fontsource) under the correct license terms,
 * so the generator can't silently regress and the artifact can't ship
 * un-attributed. It reads the committed file rather than re-running the
 * generator, so it also catches a stale commit.
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

  it('declares the MIT-licensed entries as MIT', () => {
    // franc closure (4) + react/react-dom/scheduler (3) are all MIT.
    const mitMarkers = text.match(/_License: MIT_/g) ?? [];
    expect(mitMarkers.length).toBeGreaterThanOrEqual(4);
  });

  it('attributes the bundled popup/options UI runtime', () => {
    for (const name of ['react', 'react-dom', 'lucide', 'lucide-react', '@fontsource/manrope']) {
      expect(text).toContain(`## ${name}@`);
    }
  });

  it('credits the React runtime under MIT', () => {
    expect(text).toContain('## react@');
    expect(text).toContain('_License: MIT_');
    expect(text).toContain('Meta Platforms, Inc.');
  });

  it('reproduces the ISC notice for the Lucide icon set', () => {
    expect(text).toContain('## lucide@');
    expect(text).toContain('_License: ISC_');
    // The load-bearing ISC permission clause, verbatim from lucide's LICENSE.
    expect(text).toContain('Permission to use, copy, modify, and/or distribute this software');
    expect(text).toContain('Lucide Icons and Contributors');
  });

  it('reproduces the OFL-1.1 font license verbatim, reserved-font-name clause included', () => {
    expect(text).toContain('## @fontsource/manrope@');
    expect(text).toContain('_License: OFL-1.1_');
    expect(text).toContain('SIL Open Font License');
    // The substantive OFL clause — proves we shipped the real file, not a synthesized stub.
    expect(text).toMatch(/Reserved Font Name/i);
  });

  it('is the generated file, not a hand-maintained list', () => {
    expect(text).toContain('GENERATED FILE — do not edit by hand');
  });
});
