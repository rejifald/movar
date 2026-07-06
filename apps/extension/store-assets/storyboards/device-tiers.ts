/**
 * Device tiers for the store screenshots.
 *
 * Every screenshot surface renders at one of three fixed canvas sizes, and
 * each must show the fake website in the *matching* layout — a phone
 * screenshot shows the phone layout, a tablet screenshot the tablet layout, a
 * desktop screenshot the desktop layout. This is a standing rule (see
 * `store-assets/REQUIREMENTS.md`) enforced structurally: the frame stamps
 * `deviceTierClass(tier)` on the scaled-content wrapper, so a backdrop's
 * tier-scoped CSS (`.movar-device-phone .movar-backdrop-shop { … }`) selects
 * the right layout with no per-story wiring. New scenes inherit the rule
 * automatically because the tier is *derived from the canvas the story renders
 * at* (`deviceTierForWidth`), never declared per scene.
 */
export type DeviceTier = 'phone' | 'tablet' | 'desktop';

/** Canvas widths (px) of the three screenshot surfaces. */
export const DESKTOP_CANVAS_WIDTH = 1280; // landscape CWS/AMO + macOS App Store
export const PHONE_CANVAS_WIDTH = 1320; //   iPhone 6.9″ (1320×2868)
export const TABLET_CANVAS_WIDTH = 2048; //  iPad 13″ (2048×2732)

/**
 * Native composition width each tier's backdrops are authored at, before the
 * frame scales them up to fill the canvas. Tablet is the iPad's logical width
 * (×2 → 2048). Phone is a touch wider than the iPhone's exact logical width so
 * the single-column mobile layouts show more of the page — denser and less
 * zoomed, so the localised payload (title, price, feature bullets, article
 * lede) clears the diptych fold. It still fills the canvas and reads as a
 * phone. Desktop keeps the marketing composition width the landscape frame has
 * always used.
 */
export const TIER_COMPOSITION_WIDTH: Record<DeviceTier, number> = {
  phone: 520,
  tablet: 1024, // iPad logical width (×2 → 2048)
  desktop: 880,
};

/**
 * Map a canvas width to its device tier. The three surface widths are distinct
 * (1280 < 1320 < 2048), so the canvas width alone determines the tier.
 */
export function deviceTierForWidth(width: number): DeviceTier {
  if (width <= DESKTOP_CANVAS_WIDTH) return 'desktop';
  if (width < TABLET_CANVAS_WIDTH) return 'phone';
  return 'tablet';
}

/** Marker class the frame stamps so backdrops can select their tier layout. */
export function deviceTierClass(tier: DeviceTier): string {
  return `movar-device-${tier}`;
}
