/**
 * Parity guard for the privacy / data-collection claims that must stay
 * mutually consistent across four surfaces:
 *
 *   - the public privacy page        apps/marketing/src/pages/privacy.astro (+ uk/)
 *   - the Chrome Web Store form       apps/extension/store-assets/chrome/PRIVACY-FORM.md
 *   - the Edge Add-ons form           apps/extension/store-assets/edge/PRIVACY-FORM.md
 *   - the deployment checklist        deployment-checklist.md
 *
 * The risk this catches: someone updates one document's data-flow story (e.g.
 * "we now collect X" or drops the no-server claim) and the others silently
 * diverge, so a store reviewer or user sees contradictory statements. We assert
 * the *load-bearing* claims appear in each place rather than diffing prose, so
 * normal copy edits don't trip the guard but a real contradiction does.
 *
 * There is no repo-root vitest; this test lives in the extension suite (which
 * runs under `pnpm validate`) and reaches the marketing + root files by relative
 * path. It deliberately does NOT touch scripts/check-readme-parity.mts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../../..');
const read = (rel: string): string => readFileSync(path.resolve(repoRoot, rel), 'utf8');

const chromeForm = read('apps/extension/store-assets/chrome/PRIVACY-FORM.md');
const edgeForm = read('apps/extension/store-assets/edge/PRIVACY-FORM.md');
const privacyEn = read('apps/marketing/src/pages/privacy.astro');
const privacyUk = read('apps/marketing/src/pages/uk/privacy.astro');
const checklist = read('deployment-checklist.md');

describe('privacy / data-collection parity across store forms, privacy page, and checklist', () => {
  it('both store forms declare no data collected', () => {
    expect(chromeForm).toMatch(/Data collected:\*\* none/i);
    expect(edgeForm).toMatch(/Data collected:\*\* none/i);
  });

  it('every surface keeps the no-own-server claim', () => {
    expect(chromeForm).toContain('Movar runs no server of its own');
    expect(edgeForm).toContain('Movar runs no server of its own');
    expect(privacyEn).toContain('Movar runs no servers of its own');
    expect(privacyUk).toContain('у Movar немає власних серверів');
    // The checklist's storage justification carries the same claim.
    expect(checklist).toContain('Movar runs no server of its own');
  });

  it('the storage split (sync = prefs, local = pause + corrections log) is consistent', () => {
    for (const doc of [chromeForm, edgeForm]) {
      expect(doc).toContain('chrome.storage.sync');
      expect(doc).toContain('chrome.storage.local');
    }
    // Both store forms cap the corrections log identically.
    expect(chromeForm).toContain('last 1,000 entries');
    expect(edgeForm).toContain('last 1,000 entries');
    expect(checklist).toContain('last 1,000 entries');
  });

  it('both store forms carry the controller/processor framing for storage.sync', () => {
    for (const doc of [chromeForm, edgeForm]) {
      expect(doc).toContain('Controller / processor framing');
      // Emphasis marker (* vs _) is prettier's choice; match the words only.
      expect(doc).toMatch(/not a [*_]controller[*_]/);
      expect(doc).toMatch(/not a [*_]processor[*_]/);
    }
  });

  it('both store forms disclose the opt-in all-host concealment surface', () => {
    for (const doc of [chromeForm, edgeForm]) {
      // The DNR justification must scope its "no page content" claim to the rule.
      expect(doc).toContain('the `declarativeNetRequest` rule itself never inspects or modifies');
      // The host-permission justification must disclose opt-in concealment.
      expect(doc).toContain('conceals on-page content');
      expect(doc).toContain('off by default');
    }
  });
});
