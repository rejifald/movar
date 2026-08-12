import { describe, expect, it } from 'vitest';
import { changelogUrl } from './changelog-url';

describe('changelogUrl', () => {
  it('anchors a released version on the English changelog', () => {
    expect(changelogUrl('en', '1.6.2')).toBe('https://movar.fyi/changelog#v1.6.2');
  });

  it("uses the site's /uk prefix for Ukrainian", () => {
    expect(changelogUrl('uk', '1.6.2')).toBe('https://movar.fyi/uk/changelog#v1.6.2');
  });

  it('keeps a pre-release suffix in the anchor', () => {
    expect(changelogUrl('en', '1.7.0-beta.1')).toBe('https://movar.fyi/changelog#v1.7.0-beta.1');
  });

  // The static-serve preview renders `version = 'preview'` (no `getManifest()`).
  // An anchor for it would resolve to nothing, so the link opens the top of the
  // page — the newest release — instead.
  it.each(['preview', '', '1.6', 'v1.6.2'])('drops the anchor for %o', (version) => {
    expect(changelogUrl('en', version)).toBe('https://movar.fyi/changelog');
  });
});
