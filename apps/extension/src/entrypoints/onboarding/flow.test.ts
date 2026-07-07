import { describe, expect, it } from 'vitest';
import { chromiumVendor, resolveFlow, stepsForFlow } from './flow';
import type { OnboardingFlow } from './flow';

describe('resolveFlow', () => {
  const base = { ua: '', hasBrave: false, appleMobile: false };

  it('maps the Chrome build to the chromium flow', () => {
    expect(resolveFlow({ ...base, buildTarget: 'chrome' })).toBe('chromium');
  });

  it('maps the Firefox build to the firefox flow', () => {
    expect(resolveFlow({ ...base, buildTarget: 'firefox' })).toBe('firefox');
  });

  it('maps the Safari build to the safari flow on desktop', () => {
    expect(resolveFlow({ ...base, buildTarget: 'safari' })).toBe('safari');
  });

  it('maps the Safari build to safari-ios on an Apple mobile device', () => {
    expect(resolveFlow({ ...base, buildTarget: 'safari', appleMobile: true })).toBe('safari-ios');
  });

  it('falls back to the chromium flow for an unknown build target', () => {
    expect(resolveFlow({ ...base, buildTarget: 'wut' })).toBe('chromium');
  });

  it('ignores appleMobile off the Safari build (a touch Chromium device is still chromium)', () => {
    expect(resolveFlow({ ...base, buildTarget: 'chrome', appleMobile: true })).toBe('chromium');
  });
});

describe('chromiumVendor', () => {
  const CHROME_UA = 'mozilla/5.0 (macintosh) applewebkit/537 chrome/120 safari/537';

  it('detects Brave from the navigator flag, before any UA token', () => {
    expect(chromiumVendor(CHROME_UA, true)).toBe('brave');
  });

  it('detects Edge from edg/, which also carries chrome/', () => {
    expect(chromiumVendor(`${CHROME_UA} edg/120`, false)).toBe('edge');
  });

  it('detects Opera from opr/, which also carries chrome/', () => {
    expect(chromiumVendor(`${CHROME_UA} opr/106`, false)).toBe('opera');
  });

  it('defaults to chrome for a plain Chromium UA', () => {
    expect(chromiumVendor(CHROME_UA, false)).toBe('chrome');
  });
});

const kindsOf = (flow: OnboardingFlow) => stepsForFlow(flow).map((step) => step.kind);
const accessAware = (flow: OnboardingFlow) =>
  stepsForFlow(flow).find((step) => step.kind === 'access')?.permissionAware ?? false;

describe('stepsForFlow', () => {
  const ALL_FLOWS = ['chromium', 'firefox', 'safari', 'safari-ios'] as const;

  it('chromium + firefox open with pin, then the access step', () => {
    expect(kindsOf('chromium')).toEqual(['pin', 'access']);
    expect(kindsOf('firefox')).toEqual(['pin', 'access']);
  });

  it('safari (desktop + iOS) open with enable instead of pin', () => {
    expect(kindsOf('safari')).toEqual(['enable', 'access']);
    expect(kindsOf('safari-ios')).toEqual(['enable', 'access']);
  });

  it('every flow surfaces the host-access step', () => {
    for (const flow of ALL_FLOWS) {
      expect(kindsOf(flow)).toContain('access');
    }
  });

  it('marks the access step permission-aware only where permissions.contains is meaningful', () => {
    expect(accessAware('chromium')).toBe(true);
    expect(accessAware('firefox')).toBe(true);
    expect(accessAware('safari')).toBe(false);
    expect(accessAware('safari-ios')).toBe(false);
  });

  it('marks pin as optional on chromium + firefox; safari/safari-ios have no optional step', () => {
    expect(stepsForFlow('chromium')[0]?.optional).toBe(true);
    expect(stepsForFlow('firefox')[0]?.optional).toBe(true);
    expect(stepsForFlow('safari').some((step) => step.optional === true)).toBe(false);
    expect(stepsForFlow('safari-ios').some((step) => step.optional === true)).toBe(false);
  });

  it('always ends with the access step', () => {
    for (const flow of ALL_FLOWS) {
      const steps = stepsForFlow(flow);
      expect(steps.at(-1)?.kind).toBe('access');
    }
  });
});
