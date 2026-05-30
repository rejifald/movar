import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** `ACCEPT_LANGUAGE_RULE_ID` is an internal constant in `dnr.ts` (not
 *  exported — it's an implementation detail). We parse it from the source
 *  text rather than making it public. This mirrors what the original e2e
 *  drift test did (russian-browser-lang.spec.ts), but runs in the extension's
 *  vitest suite where the source files are directly accessible via `__dirname`,
 *  avoiding the cross-package filesystem gymnastics the e2e package needed.
 *
 *  If `ACCEPT_LANGUAGE_RULE_ID` is ever promoted to a named export, replace
 *  the regex approach with a direct import and update this test. */
describe('ACCEPT_LANGUAGE_RULE_ID', () => {
  it('is 1 (stable DNR contract — changing this breaks users mid-session)', () => {
    const src = readFileSync(path.resolve(__dirname, 'dnr.ts'), 'utf8');
    const match = /ACCEPT_LANGUAGE_RULE_ID\s*=\s*(\d+)/.exec(src);
    const ruleId = match ? Number(match[1]) : null;

    // The pinned value is 1. If this test fails it means dnr.ts changed the
    // constant — Chrome's declarativeNetRequest keyed any in-flight rules to
    // that id, so bumping it orphans existing rules until the next SW restart.
    // Any change must be intentional and paired with a migration strategy.
    expect(ruleId).toBe(1);
  });
});
