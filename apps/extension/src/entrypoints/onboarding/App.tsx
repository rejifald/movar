import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { Check, Globe, Pin, Puzzle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark, Button } from '@movar/ui';
import { I18nProvider, uiLanguageFromPriority, useI18n } from '@movar/i18n';
import type { Messages } from '@movar/i18n';
import type { UiLanguage } from '@movar/settings';
import { getSettings } from '../../lib/settings';
import { chromiumVendor, resolveFlow, stepsForFlow } from './flow';
import type { ChromiumVendor, OnboardingFlow, OnboardingStep, StepKind } from './flow';
import { usePermissionStatus } from './use-permission-status';
import type { PermissionStatusHandle } from './use-permission-status';
import { StepIllustration } from './illustrations';
import type { IllustrationName } from './illustrations';

/** WXT replaces this with the build target at bundle time ('chrome' | 'firefox'
 *  | 'safari'); read defensively so a test that renders without the replacement
 *  falls back to the Chromium flow rather than crashing. */
const BUILD_TARGET = (import.meta.env as { BROWSER?: string }).BROWSER ?? 'chrome';

/** Chromium vendor → the Latin-form label the copy interpolates. Kept out of
 *  i18n: proper nouns read identically in both locales (copy.md §1.10). */
const VENDOR_LABEL: Record<ChromiumVendor, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  opera: 'Opera',
};

/** One lucide glyph per step kind — the App owns the icon mapping so flow.ts
 *  stays framework-free. */
const STEP_ICON: Record<StepKind, LucideIcon> = {
  pin: Pin,
  enable: Puzzle,
  access: Globe,
};

/** Steps that point at concrete browser UI get a matching illustration; reload +
 *  set-language are generic, so they get none. */
const STEP_ILLUSTRATION: Partial<Record<StepKind, IllustrationName>> = {
  pin: 'toolbar',
  access: 'menu',
  enable: 'toggle',
};

/** iOS / iPadOS check, mirroring the marketing detector: iPhone/iPod/iPad name
 *  themselves; iPadOS masquerades as desktop macOS, so a touch-capable
 *  "Macintosh" is the tell (no Mac ships a touchscreen). */
function isAppleMobile(ua: string): boolean {
  if (/iphone|ipod|ipad/.test(ua)) return true;
  return (
    ua.includes('macintosh') && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
  );
}

/** Resolve the flow + vendor label once from the live environment. */
function detectFlow(): { flow: OnboardingFlow; browserLabel: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent.toLowerCase();
  const hasBrave = typeof navigator !== 'undefined' && 'brave' in navigator;
  const flow = resolveFlow({
    buildTarget: BUILD_TARGET,
    ua,
    hasBrave,
    appleMobile: isAppleMobile(ua),
  });
  return { flow, browserLabel: VENDOR_LABEL[chromiumVendor(ua, hasBrave)] };
}

/** Follow the user's stored preference for the onboarding chrome, same as the
 *  popup/options. Starts at `'auto'` (browser UI language) and updates once
 *  first-run settings resolve — the provider re-renders into the right locale. */
function useUiLanguage(): UiLanguage {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('auto');
  useEffect(() => {
    let cancelled = false;
    getSettings().then(
      (settings) => {
        if (!cancelled) setUiLanguage(uiLanguageFromPriority(settings.priority));
      },
      () => {
        // Keep 'auto' — a failed settings read shouldn't blank the page.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return uiLanguage;
}

function browserUiLanguage(): string {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return 'en';
  }
}

export function App() {
  const uiLanguage = useUiLanguage();
  return (
    <I18nProvider uiLanguage={uiLanguage} browserUiLanguage={browserUiLanguage()}>
      <OnboardingBody />
    </I18nProvider>
  );
}

/** Split from `App` so `useI18n()` resolves under the provider above. */
function OnboardingBody() {
  const { t } = useI18n();
  const { flow, browserLabel } = useMemo(() => detectFlow(), []);
  const steps = useMemo(() => stepsForFlow(flow), [flow]);
  const permission = usePermissionStatus();

  return (
    <main className="bg-surface text-ink-strong min-h-screen font-sans">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <BrandMark size={48} title="Movar" />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{t.onboarding.title}</h1>
            <p className="text-ink-soft text-balance">{t.onboarding.intro}</p>
          </div>
        </header>

        <ol className="flex flex-col gap-4">
          {steps.map((step, index) => (
            <StepCard
              key={step.kind}
              step={step}
              index={index + 1}
              total={steps.length}
              flow={flow}
              browserLabel={browserLabel}
              permission={permission}
            />
          ))}
        </ol>

        <p className="text-ink-faint border-border border-t pt-6 text-center text-sm text-balance">
          {t.onboarding.reassurance}
        </p>
      </div>
    </main>
  );
}

interface StepCardProps {
  step: OnboardingStep;
  index: number;
  total: number;
  flow: OnboardingFlow;
  browserLabel: string;
  permission: PermissionStatusHandle;
}

function StepCard({ step, index, total, flow, browserLabel, permission }: Readonly<StepCardProps>) {
  const { t } = useI18n();
  const Icon = STEP_ICON[step.kind];
  const { title, body } = resolveStepCopy(t, flow, step.kind, browserLabel);
  const illustration = STEP_ILLUSTRATION[step.kind];

  return (
    <li className="border-border bg-surface-2 flex gap-4 rounded-xl border p-5">
      <span
        aria-hidden="true"
        className="bg-surface-3 text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-2">
        {/* Not uppercased: the Ukrainian "з" (of) in "Крок 1 з 4" reads as the
            digit 3 when capitalised ("КРОК 1 З 4"). */}
        <p className="text-ink-faint text-xs font-medium tracking-wide">
          {t.onboarding.stepLabel(index, total)}
          {step.optional === true ? ` · ${t.onboarding.optionalBadge}` : null}
        </p>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-ink-soft text-sm">{body}</p>
        {illustration === undefined ? null : <StepIllustration name={illustration} />}
        {step.permissionAware === true ? <PermissionLine permission={permission} /> : null}
      </div>
    </li>
  );
}

/** Best-effort host-access readout under the access step. Silent while checking
 *  or where the API is unavailable (preview, Safari); a green confirmation when
 *  held; a button that fires the native "allow access" prompt directly when
 *  missing (covers both a Chromium user who's never granted it and a Firefox
 *  user who revoked it — same trigger, same API), plus a manual re-check link
 *  for a grant/revoke made outside this button. */
function PermissionLine({ permission }: Readonly<{ permission: PermissionStatusHandle }>) {
  const { t } = useI18n();
  const { status, recheck, request } = permission;

  if (status === 'granted') {
    return (
      <p className="text-accent inline-flex items-center gap-2 pt-1 text-sm font-medium">
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t.onboarding.permission.granted}
      </p>
    );
  }

  if (status === 'missing' || status === 'requesting') {
    const requesting = status === 'requesting';
    return (
      <div className="flex flex-col items-start gap-2 pt-1 text-sm">
        <p className="text-ink-soft">{t.onboarding.permission.missing}</p>
        <Button variant="secondary" size="sm" onClick={request} disabled={requesting}>
          {requesting ? t.onboarding.permission.requesting : t.onboarding.permission.button}
        </Button>
        <button type="button" onClick={recheck} className="text-accent hover:underline">
          {t.onboarding.permission.recheck}
        </button>
      </div>
    );
  }

  // 'checking' | 'unavailable' — no line.
  return null;
}

/** Map a (flow, step kind) to its copy. `pin` is shared across flows; `access` /
 *  `enable` are flow-specific (the "read every website" wording differs on each
 *  browser). */
export function resolveStepCopy(
  t: Messages,
  flow: OnboardingFlow,
  kind: StepKind,
  browserLabel: string,
): { title: string; body: string } {
  const o = t.onboarding;
  switch (kind) {
    case 'pin': {
      return { title: o.steps.pin.title, body: o.steps.pin.body(browserLabel) };
    }
    case 'enable': {
      return flow === 'safari-ios' ? o.enable.safariIos : o.enable.safari;
    }
    case 'access': {
      return resolveAccessCopy(o, flow, browserLabel);
    }
  }
}

export function resolveAccessCopy(
  o: Messages['onboarding'],
  flow: OnboardingFlow,
  browserLabel: string,
): { title: string; body: string } {
  switch (flow) {
    case 'chromium': {
      return { title: o.access.chromium.title, body: o.access.chromium.body(browserLabel) };
    }
    case 'firefox': {
      return o.access.firefox;
    }
    case 'safari': {
      return o.access.safari;
    }
    case 'safari-ios': {
      return o.access.safariIos;
    }
  }
}
