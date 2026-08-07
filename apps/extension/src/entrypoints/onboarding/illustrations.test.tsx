import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { mockupFor } from '@movar/browser-ui';
import type { BrowserUiMockup, InstallFlow } from '@movar/browser-ui';
import { StepIllustration } from './illustrations';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every mockup the onboarding can actually reach — i.e. the ones the shared
 *  table hands back for the post-install step kinds. The pre-install `confirm`
 *  mockups belong to the marketing site and never render here. */
const REACHABLE: readonly BrowserUiMockup[] = (
  ['chromium', 'firefox', 'safari', 'safari-ios'] as const satisfies readonly InstallFlow[]
).flatMap((flow) =>
  (['pin', 'enable', 'access'] as const)
    .map((kind) => mockupFor(flow, kind))
    .filter((mockup): mockup is BrowserUiMockup => mockup !== null),
);

describe('StepIllustration', () => {
  it.each(REACHABLE)('renders %s as decorative markup', (mockup) => {
    const { container } = render(<StepIllustration mockup={mockup} locale="en" />);

    // The wrapper is `display: contents`, so the mockup's own root is the first
    // element that matters — and it must be hidden from assistive tech: it's a
    // picture of another product's UI, not controls the reader can operate.
    const root = container.querySelector('.bui');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-hidden')).toBe('true');
  });

  it("draws the browser's words in the requested locale", () => {
    const { container } = render(<StepIllustration mockup="chromium-site-access" locale="uk" />);

    expect(container.textContent).toContain('На всіх сайтах');
  });

  it("resolves Movar's icon through the extension runtime", () => {
    const { container } = render(<StepIllustration mockup="chromium-toolbar" locale="en" />);

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/icon/48.png');
  });

  it('falls back to the plain icon path where runtime.getURL is unavailable', () => {
    // Storybook and the static popup preview mount these components without an
    // extension origin, where `getURL` throws. A thrown icon lookup must not
    // take the whole onboarding page down with it.
    // Cast for the same reason the source does: WXT types `getURL` to the
    // paths it knows at build time, so it isn't in `runtime`'s spy-able union.
    const runtime = browser.runtime as unknown as { getURL(path: string): string };
    vi.spyOn(runtime, 'getURL').mockImplementation(() => {
      throw new Error('no extension origin');
    });

    const { container } = render(<StepIllustration mockup="chromium-toolbar" locale="en" />);

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/icon/48.png');
    expect(container.querySelector('.bui')).not.toBeNull();
  });

  it('gives each flow its own picture of the access step', () => {
    // The regression this guards: all four flows once shared one abstract
    // illustration, so a Firefox user saw a Chrome menu and an iPhone user saw
    // a desktop one.
    const access = (['chromium', 'firefox', 'safari', 'safari-ios'] as const).map((flow) =>
      mockupFor(flow, 'access'),
    );

    expect(new Set(access).size).toBe(access.length);
  });
});
