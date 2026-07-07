/*
 * Which install flow the first-run onboarding page walks a visitor through.
 * Pure + framework-free so the resolver and the per-flow step list are
 * unit-tested directly (see __tests__/flow.test.ts) and carry no React / lucide
 * / `browser` dependency — the App maps the abstract step kinds to icons and
 * i18n copy.
 *
 * A "flow" is a permission model, not a single browser. Chrome, Edge, Brave and
 * Opera install one Chromium build from one store and share one host-access UI,
 * so they collapse to a single `chromium` flow that differs only in the vendor
 * label. Firefox and Safari each ship their own build with their own permission
 * surface; Safari splits desktop from iOS because the enable path lives in a
 * different place (Safari Settings vs the iOS Settings app).
 */

/** The permission-model flow a visitor is in. */
export type OnboardingFlow = 'chromium' | 'firefox' | 'safari' | 'safari-ios';

/** The specific Chromium vendor — used only for the label + store name; all
 *  four share the `chromium` flow's steps. */
export type ChromiumVendor = 'chrome' | 'edge' | 'brave' | 'opera';

/** Abstract step kinds, mapped to an icon + i18n copy by the App. `access` and
 *  `enable` copy is flow-specific (the "read every website" wording differs on
 *  each browser); `pin` copy is shared across flows. */
export type StepKind = 'pin' | 'enable' | 'access';

export interface OnboardingStep {
  readonly kind: StepKind;
  /** Render the best-effort "Movar can read every page" status under this step.
   *  Set only where `permissions.contains` is meaningful (Chromium + Firefox);
   *  Safari's "Allow on Every Website" is Safari-managed and not reflected there,
   *  so its access step stays purely instructional. */
  readonly permissionAware?: boolean;
  /** Mark this step as skippable (currently just `pin` — the toolbar icon is a
   *  convenience, not something Movar needs to function). */
  readonly optional?: boolean;
}

export interface FlowInput {
  /** WXT build target — `import.meta.env.BROWSER` ('chrome' | 'firefox' |
   *  'safari'). Authoritative for the flow family: the Safari build only runs on
   *  Safari, the Firefox build only on Firefox, and the Chrome build serves
   *  every Chromium vendor. */
  readonly buildTarget: string;
  /** Lowercased `navigator.userAgent`. */
  readonly ua: string;
  /** `'brave' in navigator` — Brave hides itself in the UA but exposes this. */
  readonly hasBrave: boolean;
  /** iOS / iPadOS device — splits the Safari build's desktop and mobile flows. */
  readonly appleMobile: boolean;
}

/**
 * Resolve the flow from the build target + device. The build target decides the
 * family (a Chromium build can't run on Firefox or Safari); only Safari needs
 * the device split, since one Safari build covers macOS and iOS/iPadOS.
 */
export function resolveFlow(input: FlowInput): OnboardingFlow {
  if (input.buildTarget === 'safari') return input.appleMobile ? 'safari-ios' : 'safari';
  if (input.buildTarget === 'firefox') return 'firefox';
  return 'chromium';
}

/**
 * Which Chromium vendor a visitor is on, for the label + store name. Edge
 * ("edg/") and Opera ("opr/") UAs also contain "chrome", so their distinguishing
 * token has to be checked first; Brave hides in the UA and is matched on
 * `navigator.brave` before any token. Order mirrors the marketing site's
 * detector (apps/marketing/src/lib/downloads.ts) so both surfaces agree.
 */
export function chromiumVendor(ua: string, hasBrave: boolean): ChromiumVendor {
  if (hasBrave) return 'brave';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('opr/')) return 'opera';
  return 'chrome';
}

/**
 * The ordered steps for a flow, trimmed to what's actually required: granting
 * host access. Chromium and Firefox also offer `pin` (optional — the toolbar
 * icon is a convenience); Safari opens with `enable` instead (the extension is
 * off until switched on in Settings, so there's no optional step there). Every
 * flow ends on `access` — the "let Movar read every website" step this whole
 * page exists to make unmissable.
 */
export function stepsForFlow(flow: OnboardingFlow): readonly OnboardingStep[] {
  if (flow === 'safari' || flow === 'safari-ios') {
    return [{ kind: 'enable' }, { kind: 'access' }];
  }

  // chromium + firefox
  return [
    { kind: 'pin', optional: true },
    { kind: 'access', permissionAware: true },
  ];
}
