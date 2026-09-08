import { describe, expect, it } from 'vitest';
import { SITE_URL, changelogPath, changelogUrl, uninstallPath, uninstallUrl } from './index';

describe('changelogPath', () => {
  it("follows the site's /uk prefix convention", () => {
    // The same routing rule every localized marketing page uses;
    // `localeChangelogHref()` in apps/marketing/src/i18n.ts delegates here.
    expect(changelogPath('en')).toBe('/changelog');
    expect(changelogPath('uk')).toBe('/uk/changelog');
  });
});

describe('changelogUrl', () => {
  it('anchors a released version on the English changelog', () => {
    expect(changelogUrl('en', '1.6.2')).toBe(`${SITE_URL}/changelog#v1.6.2`);
  });

  it("uses the site's /uk prefix for Ukrainian", () => {
    expect(changelogUrl('uk', '1.6.2')).toBe(`${SITE_URL}/uk/changelog#v1.6.2`);
  });

  it('keeps a pre-release suffix in the anchor', () => {
    expect(changelogUrl('en', '1.7.0-beta.1')).toBe(`${SITE_URL}/changelog#v1.7.0-beta.1`);
  });

  // Each surface has a fallback for when it can't read its real version: the
  // extension renders `preview` under static-serve (no `getManifest()`), the
  // Safari host app renders `dev` without the build-time define. An anchor for
  // either would resolve to nothing, so the link opens the top of the page —
  // the newest release — instead.
  it.each(['preview', 'dev', '', '1.6', 'v1.6.2', ' 1.6.2'])(
    'drops the anchor for %o',
    (version) => {
      expect(changelogUrl('en', version)).toBe(`${SITE_URL}/changelog`);
    },
  );

  it('is built from SITE_URL, so a site move carries every surface with it', () => {
    // The four consumers (popup, options, host-app About footer, marketing
    // footer) all read this one builder — nothing re-spells the origin.
    expect(changelogUrl('uk', '1.6.2').startsWith(SITE_URL)).toBe(true);
  });
});

describe('uninstallPath', () => {
  it("follows the site's /uk prefix convention", () => {
    expect(uninstallPath('en')).toBe('/uninstall');
    expect(uninstallPath('uk')).toBe('/uk/uninstall');
  });
});

describe('uninstallUrl', () => {
  it('carries a released version for the English page', () => {
    expect(uninstallUrl('en', '1.8.1')).toBe(`${SITE_URL}/uninstall?v=1.8.1`);
  });

  it("uses the site's /uk prefix for Ukrainian", () => {
    expect(uninstallUrl('uk', '1.8.1')).toBe(`${SITE_URL}/uk/uninstall?v=1.8.1`);
  });

  it('keeps a pre-release suffix', () => {
    expect(uninstallUrl('en', '1.9.0-beta.1')).toBe(`${SITE_URL}/uninstall?v=1.9.0-beta.1`);
  });

  // Same fallbacks as the changelog anchor: rather than a bare `?v=` or a
  // fabricated value, the page opens clean and renders its no-version copy.
  it.each(['preview', 'dev', '', '1.8', 'v1.8.1', ' 1.8.1'])(
    'emits no parameter for %o',
    (version) => {
      expect(uninstallUrl('en', version)).toBe(`${SITE_URL}/uninstall`);
    },
  );

  // The load-bearing promise: this URL is the extension's only outbound
  // navigation, and the version is the only thing it may ever carry. A second
  // parameter here would be the extension reporting on the user at the one
  // moment they can no longer inspect it.
  it('never carries anything but the version', () => {
    const url = new URL(uninstallUrl('uk', '1.8.1'));
    // .forEach rather than .keys(): the repo bans the WebIDL iterators, which
    // don't survive Firefox's Xray wrapper in a content script.
    const names: string[] = [];
    url.searchParams.forEach((_value, key) => names.push(key));
    expect(names).toEqual(['v']);
  });
});
