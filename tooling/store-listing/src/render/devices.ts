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

export const DEVICE_PROFILES: readonly DeviceProfile[] = [IPHONE_17_PRO_MAX, ANDROID_GENERIC];

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
