/**
 * Device profiles (data) and `phoneShape` — the ONE place a phone's proportions
 * are derived. Rim, bezel and every corner radius come from the screen width via
 * a profile's millimetre dimensions; nothing else in the renderer carries a
 * hard-coded bezel size.
 */

export interface DeviceProfile {
  id: string;
  label: string;
  /** Physical body, mm. */
  bodyMm: { w: number; h: number };
  /** Physical display, mm (centred in the body). */
  displayMm: { w: number; h: number };
  /** Visible metal frame, mm — the thin silver rim; the rest of the edge is black bezel. */
  rimMm: number;
  /** Display corner radius, mm. */
  cornerRadiusMm: number;
  /** The status bar as a share of the capture height, where it differs from the iPhone's. */
  statusBarShare?: number;
}

/** The default edge rule: body edge = 3.5 % of the screen width on every side. */
export const DEFAULT_EDGE_FRACTION = 0.035;
const DEFAULT_RIM_FRACTION = 0.0082;
const DEFAULT_CORNER_FRACTION = 0.13;
const REFERENCE_DISPLAY_MM = 100;
/** A capture is matched to a profile when its ratio is within this of the display's. */
const PROFILE_MATCH_TOLERANCE = 0.01;

/** iPhone 17 Pro Max: body 78.0 x 163.4 mm around a 72.88 mm wide display. */
export const IPHONE_17_PRO_MAX: DeviceProfile = {
  id: 'iphone-17-pro-max',
  label: 'iPhone 17 Pro Max',
  bodyMm: { w: 78, h: 163.4 },
  displayMm: { w: 72.88, h: 158.28 },
  rimMm: 0.6,
  cornerRadiusMm: 9.5,
};

/** Generic Pixel-like 20:9 phone, for specs. Edge is the default 3.5 %. */
export const ANDROID_GENERIC: DeviceProfile = {
  id: 'android-generic',
  label: 'Android (generic, Pixel-like)',
  bodyMm: { w: 77.04, h: 165.04 },
  displayMm: { w: 72, h: 160 },
  rimMm: 0.5,
  cornerRadiusMm: 7,
};

/**
 * iPad Pro 13-inch (M5): body 215.5 x 281.6 mm. Display from its 2064 x 2752 px
 * capture at 264 ppi (198.6 x 264.8 mm), so the edge is ~8.4 mm all round.
 */
export const IPAD_PRO_13_M5: DeviceProfile = {
  id: 'ipad-pro-13-m5',
  label: 'iPad Pro 13-inch (M5)',
  bodyMm: { w: 215.5, h: 281.6 },
  displayMm: { w: 198.58, h: 264.77 },
  rimMm: 0.6,
  // ~30 pt at 2x (60 px at 264 ppi). 18 mm clipped the clock, which iPadOS draws
  // from (52, 22) px of the capture (CI run 20).
  cornerRadiusMm: 5.8,
  // 64 px (32 pt at 2x) of a 2752 px capture; the clock's glyphs end at y 42 (CI run 20).
  statusBarShare: 0.023_26,
};

export const DEVICE_PROFILES: readonly DeviceProfile[] = [
  IPHONE_17_PRO_MAX,
  IPAD_PRO_13_M5,
  ANDROID_GENERIC,
];

/** Profile for a capture of unknown origin: default 3.5 % rule around its own ratio. */
export function unknownDevice(captureWidth: number, captureHeight: number): DeviceProfile {
  const displayW = REFERENCE_DISPLAY_MM;
  const displayH = (REFERENCE_DISPLAY_MM * captureHeight) / captureWidth;
  const edge = REFERENCE_DISPLAY_MM * DEFAULT_EDGE_FRACTION;
  return {
    id: 'unknown',
    label: 'Unknown device (default 3.5 % edge)',
    bodyMm: { w: displayW + 2 * edge, h: displayH + 2 * edge },
    displayMm: { w: displayW, h: displayH },
    rimMm: REFERENCE_DISPLAY_MM * DEFAULT_RIM_FRACTION,
    cornerRadiusMm: REFERENCE_DISPLAY_MM * DEFAULT_CORNER_FRACTION,
  };
}

/** Picks the profile whose display ratio matches the capture, else derives one. */
export function resolveDevice(captureWidth: number, captureHeight: number): DeviceProfile {
  const ratio = captureHeight / captureWidth;
  const match = DEVICE_PROFILES.find(
    (profile) =>
      Math.abs(profile.displayMm.h / profile.displayMm.w / ratio - 1) <= PROFILE_MATCH_TOLERANCE,
  );
  return match ?? unknownDevice(captureWidth, captureHeight);
}

export interface PhoneShape {
  screenWidth: number;
  /** Rim + bezel: body edge on every side of the screen. */
  edge: number;
  rim: number;
  bezel: number;
  screenRadius: number;
  bezelRadius: number;
  bodyRadius: number;
  /** Body width in px (screen + both edges). */
  bodyWidth: number;
  /** Body height / width the real device has — the ratio guard 2 enforces. */
  bodyRatio: number;
}

/** Derives every phone dimension, in px, from the drawn screen width. */
export function phoneShape(screenWidthPx: number, device: DeviceProfile): PhoneShape {
  const pxPerMm = screenWidthPx / device.displayMm.w;
  const edge = ((device.bodyMm.w - device.displayMm.w) / 2) * pxPerMm;
  const rim = device.rimMm * pxPerMm;
  const bezel = edge - rim;
  const screenRadius = device.cornerRadiusMm * pxPerMm;
  return {
    screenWidth: screenWidthPx,
    edge,
    rim,
    bezel,
    screenRadius,
    bezelRadius: screenRadius + bezel,
    bodyRadius: screenRadius + edge,
    bodyWidth: screenWidthPx + 2 * edge,
    bodyRatio: device.bodyMm.h / device.bodyMm.w,
  };
}
