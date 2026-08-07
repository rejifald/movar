/*
 * `@movar/browser-ui` — flat, locale-aware recreations of the real browser UI
 * that Movar's install guidance points at.
 *
 * Two surfaces walk a visitor through the same install: the marketing site's
 * /install page (pre-install, Astro) and the extension's first-run onboarding
 * (post-install, React). They must show the same picture of the same browser
 * for the same step, and for a long time that was maintained by hand — two
 * files with a comment in each asking the next person to "keep them visually in
 * step". This package is that invariant made mechanical: one implementation,
 * one stylesheet, and one table below deciding which mockup a step gets.
 */

export { renderBrowserUi } from './mockups';
export type { BrowserUiMockup, BrowserUiOptions } from './mockups';
export { EXAMPLE_HOST, EXTENSION_NAME, labelsFor } from './labels';
export type { BrowserUiLabels, BrowserUiLocale } from './labels';

import type { BrowserUiMockup } from './mockups';

/**
 * The permission model a visitor is installing under. Mirrors
 * `OnboardingFlow` in the extension (apps/extension/src/entrypoints/onboarding/
 * flow.ts) — Chrome, Edge, Brave and Opera collapse into `chromium`; Safari
 * splits desktop from iOS because the enable path lives somewhere else entirely.
 */
export type InstallFlow = 'chromium' | 'firefox' | 'safari' | 'safari-ios';

/**
 * A step in the install, by what it asks the visitor to do.
 *
 * `store` and `confirm` only occur pre-install, so only the marketing site uses
 * them; the extension's onboarding starts at `pin`/`enable`, since by the time
 * it renders, the install already happened.
 */
export type InstallStepKind = 'store' | 'confirm' | 'pin' | 'enable' | 'access';

/**
 * Which mockup illustrates a given step of a given flow — the single table both
 * surfaces read.
 *
 * `null` means "no illustration": the `store` step points at a web page rather
 * than at browser UI, and Safari has no `pin`/`confirm` step at all. A missing
 * entry is a legitimate answer here, not an oversight.
 */
const MOCKUPS: Record<InstallFlow, Partial<Record<InstallStepKind, BrowserUiMockup>>> = {
  chromium: {
    confirm: 'chromium-install-dialog',
    pin: 'chromium-toolbar',
    access: 'chromium-site-access',
  },
  firefox: {
    confirm: 'firefox-install-dialog',
    pin: 'firefox-toolbar',
    access: 'firefox-permissions',
  },
  safari: {
    enable: 'safari-extensions',
    access: 'safari-site-access',
  },
  'safari-ios': {
    enable: 'ios-extension-toggle',
    access: 'ios-all-websites',
  },
};

/** The mockup for a step, or `null` where the step points at no browser UI. */
export function mockupFor(flow: InstallFlow, kind: InstallStepKind): BrowserUiMockup | null {
  return MOCKUPS[flow][kind] ?? null;
}
