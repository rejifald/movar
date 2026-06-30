import { Fragment } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  Code,
  Compass,
  ExternalLink,
  MessageSquare,
  Puzzle,
  Settings,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@movar/ui';
import { openFeedback, openSafariPreferences } from '../bridge';
import type { HostState } from '../bridge';
import type { HostMessages } from '../i18n';

/**
 * About tab — the demoted enablement step + the trust row, ported from
 * magical-snyder's `.about` card and reusing #168's onboarding status content
 * (`StatusBlock` / `Status` / `Path` / `Chip` / trust row).
 *
 * PER THE SPEC, the About *tab* has NO brand lockup — that header lived only in
 * #168's standalone onboarding screen. The tab is just the enablement banner +
 * the trust row. The banner is a pure function of the native {@link HostState}
 * (the `show()` feed), mirroring the legacy CSS visibility rules
 * (`.status.platform-ios` / `.platform-mac.state-setup` / `.state-on`):
 *   - `state === null` (pre-`show()`) → banner hidden, trust row only;
 *   - `platform === 'ios'` → "One last step" + the Settings → Safari →
 *     Extensions chip path, plus the iOS-only feedback button (see below);
 *   - `platform === 'mac'`, off → "One last step" + the "Open Safari Settings"
 *     CTA (`openSafariPreferences()`);
 *   - `platform === 'mac'`, on → "Movar is on" + a green status dot + the same
 *     CTA.
 * `useSettings === false` (macOS ≤ 12) swaps "Settings" → "Preferences"
 * everywhere (chip label + CTA), exactly as the legacy `data-legacy` did.
 *
 * FEEDBACK — per the user's explicit decision, the iOS host app gets a feedback
 * **button** (a `@movar/ui` Button, not a link), rendered **only on iOS** (none
 * on macOS, matching the spec). It posts `'feedback'` to the native bridge via
 * {@link openFeedback}; that needs a new Swift `feedback` case — see
 * `apps/safari-host-app/AGENTS.md`.
 *
 * Markup uses the host's ported `.about` / `.status` / `.headline` / `.helper`
 * / `.path` / `.chip` / `.dot` / `.open-preferences` / `.trust` classes (the
 * app's `styles.css` is this screen's source of truth), so it matches the
 * static screen 1:1.
 */
export interface AboutTabProps {
  /** Host-shell catalogue for the resolved locale — the enablement copy, chip
   *  labels, CTA label, trust claims, and the feedback button label. */
  messages: HostMessages;
  /** Latest native `show()` snapshot, or `null` before the host reports. */
  state: HostState | null;
}

export function AboutTab({ messages, state }: Readonly<AboutTabProps>): JSX.Element {
  return (
    <div className="card about">
      {/* Live region: Swift reveals the real state asynchronously, so the swap
          is announced rather than landing silently — preserving the old
          markup's `aria-live` behaviour. */}
      <div className="enable" aria-live="polite" aria-atomic="true">
        <StatusBanner messages={messages} state={state} />
      </div>

      {/* iOS-only feedback button. macOS has none (the spec's About screen
          carries no feedback affordance on macOS). */}
      {state?.platform === 'ios' ? (
        <Button onClick={openFeedback}>
          <MessageSquare className="size-[15px]" aria-hidden="true" />
          {messages.feedback}
        </Button>
      ) : null}

      <ul className="trust">
        <li>
          <Tag className="ico" aria-hidden="true" />
          {messages.trust.free}
        </li>
        <li>
          <Code className="ico" aria-hidden="true" />
          {messages.trust.openSource}
        </li>
        <li>
          <ShieldCheck className="ico" aria-hidden="true" />
          {messages.trust.privacy}
        </li>
      </ul>
    </div>
  );
}

/** Resolve which enablement banner to show from the bridge state, mirroring the
 *  old CSS visibility rules: iOS → iOS block; macOS enabled → "on"; macOS
 *  otherwise → setup. Renders nothing until the host reports a platform (the
 *  pre-`show()` window — trust row only). */
function StatusBanner({
  messages,
  state,
}: Readonly<{ messages: HostMessages; state: HostState | null }>): JSX.Element | null {
  if (state === null) return null;

  const { chips } = messages;
  // macOS 12 and earlier called the pane "Preferences"; the host tells us which
  // wording is current via `useSettings`.
  const settingsLabel = state.useSettings === false ? chips.settingsLegacy : chips.settings;

  if (state.platform === 'ios') {
    return (
      <Status headline={messages.ios.headline} helper={messages.ios.helper}>
        <Path
          then={messages.pathThen}
          steps={[
            { icon: Settings, label: chips.settingsApp },
            { icon: Compass, label: chips.safari },
            { icon: Puzzle, label: chips.extensions },
          ]}
        />
      </Status>
    );
  }

  const macSteps: PathStep[] = [
    { icon: Compass, label: chips.safari },
    { icon: Settings, label: settingsLabel },
    { icon: Puzzle, label: chips.extensions },
  ];
  // macOS CTA wording follows the same Settings/Preferences split.
  const ctaLabel =
    state.useSettings === false ? messages.openPreferences.legacy : messages.openPreferences.label;

  if (state.enabled === true) {
    return (
      <Status headline={messages.macOn.headline} helper={messages.macOn.helper} on>
        <Path then={messages.pathThen} steps={macSteps} />
        <OpenPreferencesButton label={ctaLabel} />
      </Status>
    );
  }

  return (
    <Status headline={messages.macSetup.headline} helper={messages.macSetup.helper}>
      <Path then={messages.pathThen} steps={macSteps} />
      <OpenPreferencesButton label={ctaLabel} />
    </Status>
  );
}

/** One status card: headline (+ optional "on" status dot), helper line, and the
 *  banner body (the chip path, and on macOS the CTA). Uses the host `.status` /
 *  `.headline` / `.dot` / `.helper` classes. */
function Status({
  headline,
  helper,
  on = false,
  children,
}: Readonly<{ headline: string; helper: string; on?: boolean; children: ReactNode }>): JSX.Element {
  return (
    <div className="status">
      <h2 className="headline">
        {on ? <span className="dot" aria-hidden="true" /> : null}
        {headline}
      </h2>
      <p className="helper">{helper}</p>
      {children}
    </div>
  );
}

/** The macOS "Open Safari Settings" CTA — posts `'open-preferences'` to the
 *  native bridge. A plain `button.open-preferences` (styled by the ported CSS)
 *  rather than a `@movar/ui` Button, matching the static screen's accent CTA. */
function OpenPreferencesButton({ label }: Readonly<{ label: string }>): JSX.Element {
  return (
    <button type="button" className="open-preferences" onClick={openSafariPreferences}>
      <span>{label}</span>
      <ExternalLink className="ico" aria-hidden="true" />
    </button>
  );
}

/** One labelled step in the chip chain. */
interface PathStep {
  icon: LucideIcon;
  label: string;
}

/** The Safari → Settings → Extensions chip chain. The visible "→" is
 *  decorative; an `sr-only` connector ("then" / "далі") keeps the spoken
 *  reading intact, matching the old `.sep` markup. Steps are keyed by their
 *  (unique) label — a stable identity, no array indices. */
function Path({ then, steps }: Readonly<{ then: string; steps: PathStep[] }>): JSX.Element {
  return (
    <p className="path">
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          {index > 0 ? (
            <span className="sep">
              <span aria-hidden="true">→</span>
              <span className="sr-only">{then}</span>
            </span>
          ) : null}
          <Chip icon={step.icon}>{step.label}</Chip>
        </Fragment>
      ))}
    </p>
  );
}

/** A single labelled step chip (bordered, surface-2 fill, accent icon). */
function Chip({
  icon: Icon,
  children,
}: Readonly<{ icon: LucideIcon; children: ReactNode }>): JSX.Element {
  return (
    <span className="chip">
      <Icon className="ico" aria-hidden="true" />
      {children}
    </span>
  );
}
