import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { mockupFor } from '@movar/browser-ui';
import type { BrowserUiMockup, InstallFlow } from '@movar/browser-ui';
import { StepIllustration } from './illustrations';

afterEach(cleanup);

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
