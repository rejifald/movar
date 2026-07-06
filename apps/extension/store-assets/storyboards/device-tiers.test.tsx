import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import {
  DESKTOP_CANVAS_WIDTH,
  PHONE_CANVAS_WIDTH,
  TABLET_CANVAS_WIDTH,
  deviceTierClass,
  deviceTierForWidth,
} from './device-tiers';
import { PortraitBeforeAfterFrameWithFrame } from './backdrops/portrait-before-after-frame';
import { IPAD_13, IPHONE_69 } from './scenes/portrait-diptych-scenes';

/**
 * Guards the standing rule that a phone screenshot renders the phone layout, a
 * tablet screenshot the tablet layout, and a desktop screenshot the desktop
 * layout (see `store-assets/REQUIREMENTS.md`). The rule is enforced by the
 * width→tier map plus the frame stamping `movar-device-*` on the scaled
 * content; both are asserted here so the mapping can't silently regress.
 */
afterEach(cleanup);

describe('deviceTierForWidth', () => {
  it('maps each screenshot surface width to its tier', () => {
    expect(deviceTierForWidth(DESKTOP_CANVAS_WIDTH)).toBe('desktop'); // 1280 landscape
    expect(deviceTierForWidth(PHONE_CANVAS_WIDTH)).toBe('phone'); //    1320 iPhone
    expect(deviceTierForWidth(TABLET_CANVAS_WIDTH)).toBe('tablet'); //  2048 iPad
  });

  it('classifies widths at/under the desktop canvas as desktop and the widest as tablet', () => {
    expect(deviceTierForWidth(640)).toBe('desktop');
    expect(deviceTierForWidth(1279)).toBe('desktop');
    expect(deviceTierForWidth(1500)).toBe('phone');
    expect(deviceTierForWidth(4096)).toBe('tablet');
  });
});

describe('deviceTierClass', () => {
  it('prefixes the tier for backdrop CSS scoping', () => {
    expect(deviceTierClass('phone')).toBe('movar-device-phone');
    expect(deviceTierClass('tablet')).toBe('movar-device-tablet');
    expect(deviceTierClass('desktop')).toBe('movar-device-desktop');
  });
});

describe('the portrait frame stamps the device-tier class', () => {
  const half = (variant: 'before' | 'after') => ({
    label: variant,
    urlBar: 'example.test',
    content: <div />,
    variant,
  });
  const scene = { lang: 'en', headline: 'Headline', before: half('before'), after: half('after') };

  it('marks the iPhone canvas as phone', () => {
    const { container } = render(<PortraitBeforeAfterFrameWithFrame {...IPHONE_69} {...scene} />);
    expect(container.querySelector('.movar-device-phone')).not.toBeNull();
    expect(container.querySelector('.movar-device-tablet')).toBeNull();
  });

  it('marks the iPad canvas as tablet', () => {
    const { container } = render(<PortraitBeforeAfterFrameWithFrame {...IPAD_13} {...scene} />);
    expect(container.querySelector('.movar-device-tablet')).not.toBeNull();
    expect(container.querySelector('.movar-device-phone')).toBeNull();
  });
});
