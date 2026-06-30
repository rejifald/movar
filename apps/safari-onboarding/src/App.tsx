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
import { Fragment } from 'react';
import type { JSX, ReactNode } from 'react';
import { Button } from '@movar/ui';
import type { OnboardingState } from './bridge';
import { openFeedback, openSafariPreferences } from './bridge';
import type { OnboardingMessages } from './i18n';
import iconUrl from './assets/icon.png';

/**
 * The Movar onboarding / enablement screen, re-platformed from the static
 * `Base.lproj/Main.html` to React while reusing the `@movar/ui` Button and the
 * shared design tokens.
 *
 * It is a pure function of the resolved locale's `messages` plus the latest
 * `state` the native bridge pushed (see `bridge.ts`). `state === null` is the
 * pre-`show()` window — Swift reveals the real platform/state asynchronously,
 * so until then we render only the locale-independent brand + trust chrome,
 * exactly as the old CSS did (`body:not(.platform-mac,.platform-ios) .status`
 * hid every status block).
 */
export interface AppProps {
  messages: OnboardingMessages;
  /** Latest snapshot from the native `show()` bridge, or `null` before the
   *  host has reported a platform. */
  state: OnboardingState | null;
}

export function App({ messages, state }: Readonly<AppProps>): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[52px] p-[18px] text-center">
      <Brand subtitle={messages.brandSubtitle} />

      <main className="flex flex-col items-center gap-[17px]">
        {/* Live region: Swift reveals the real state asynchronously, so the
            swap is announced to assistive tech rather than landing silently —
            preserving the old markup's aria-live behaviour. */}
        <div className="flex flex-col items-center" aria-live="polite" aria-atomic="true">
          <StatusBlock messages={messages} state={state} />
        </div>

        {state?.platform === 'mac' ? (
          <Button onClick={openSafariPreferences} className="px-[18px]">
            {state.useSettings === false
              ? messages.openPreferences.legacy
              : messages.openPreferences.label}
            <ExternalLink className="size-[15px]" aria-hidden="true" />
          </Button>
        ) : null}
      </main>

      <TrustFooter trust={messages.trust} feedbackLabel={messages.feedback} />
    </div>
  );
}

/** Compact horizontal brand lockup — logo left, title + subtitle stacked. */
function Brand({ subtitle }: Readonly<{ subtitle: string }>): JSX.Element {
  return (
    <header className="flex items-center gap-[11px]">
      <img
        className="size-10 shrink-0 drop-shadow-[0_3px_8px_rgba(20,15,5,0.18)]"
        src={iconUrl}
        width={128}
        height={128}
        alt=""
      />
      <div className="flex flex-col text-left">
        <h1 className="text-ink-strong text-[17px] leading-[20px] font-bold tracking-[-0.01em]">
          Movar
        </h1>
        <p className="text-ink-soft text-[12px] leading-[20px]">{subtitle}</p>
      </div>
    </header>
  );
}

/** Resolve which of the three status blocks to show from the bridge state,
 *  mirroring the old CSS visibility rules: iOS → iOS block; macOS enabled →
 *  "on"; macOS otherwise (incl. pre-state) → setup. Renders nothing until the
 *  host reports a platform. */
function StatusBlock({
  messages,
  state,
}: Readonly<{ messages: OnboardingMessages; state: OnboardingState | null }>): JSX.Element | null {
  if (state === null) return null;

  const { chips } = messages;
  // macOS 12 and earlier called the pane "Preferences"; the host tells us
  // which wording is current via `useSettings`.
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

  if (state.enabled === true) {
    return (
      <Status headline={messages.macOn.headline} helper={messages.macOn.helper} on>
        <Path then={messages.pathThen} steps={macSteps} />
      </Status>
    );
  }

  return (
    <Status headline={messages.macSetup.headline} helper={messages.macSetup.helper}>
      <Path then={messages.pathThen} steps={macSteps} />
    </Status>
  );
}

/** One status card: headline (+ optional "on" status dot), helper line, and a
 *  chip path. */
function Status({
  headline,
  helper,
  on = false,
  children,
}: Readonly<{ headline: string; helper: string; on?: boolean; children: ReactNode }>): JSX.Element {
  return (
    <div className="flex max-w-[340px] flex-col items-center gap-2">
      <h2 className="text-ink-strong inline-flex items-center gap-2 text-[20px] font-bold tracking-[-0.01em]">
        {on ? (
          <span
            className="bg-accent size-[9px] rounded-full shadow-[0_0_0_3px_rgba(21,128,61,0.16)]"
            aria-hidden="true"
          />
        ) : null}
        {headline}
      </h2>
      <p className="text-ink-soft mt-px text-[12.5px]">{helper}</p>
      {children}
    </div>
  );
}

/** One labelled step in the chip chain. */
interface PathStep {
  icon: LucideIcon;
  label: string;
}

/** The Safari → Settings → Extensions chip chain. The visible "→" is
 *  decorative; an `sr-only` connector ("then"/"далі") keeps the spoken reading
 *  intact, matching the old `.sep` markup. Steps are keyed by their (unique)
 *  label — a stable identity, no array indices. */
function Path({ then, steps }: Readonly<{ then: string; steps: PathStep[] }>): JSX.Element {
  return (
    <p className="mt-0.5 flex flex-wrap items-center justify-center gap-[5px]">
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          {index > 0 ? (
            <span className="text-ink-faint text-[12px]">
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
    <span className="border-border-strong bg-surface-2 text-ink-strong inline-flex items-center gap-1 rounded-lg border py-[3px] pr-2 pl-[7px] text-[11.5px] font-semibold whitespace-nowrap">
      <Icon className="text-accent size-[13px] shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Trust footer — a quiet, link-like "Send feedback" action over the
 *  Free / Open source / Privacy claims (same lucide marks as the marketing
 *  hero). It's a tertiary affordance: deliberately styled as a faint text
 *  link (not a `@movar/ui` Button) so it never competes with the macOS
 *  "Open Safari Settings" primary CTA above it, matching the extension
 *  footer's feedback/Settings links (`text-ink-faint hover:text-ink-strong
 *  transition-colors`). It stays a real `<button>` with an accessible name
 *  ("Send feedback"), platform-independent (feedback is useful on iOS and
 *  macOS alike). Clicking posts `'feedback'` to the native bridge — see
 *  `openFeedback` for why the bridge, not a `mailto:` anchor. */
function TrustFooter({
  trust,
  feedbackLabel,
}: Readonly<{ trust: OnboardingMessages['trust']; feedbackLabel: string }>): JSX.Element {
  return (
    <footer className="flex flex-col items-center gap-[14px]">
      <button
        type="button"
        onClick={openFeedback}
        className="text-ink-faint hover:text-ink-strong inline-flex items-center gap-1.5 text-[11.5px] transition-colors hover:underline hover:underline-offset-2 motion-reduce:transition-none"
      >
        <MessageSquare className="size-[13px] shrink-0" aria-hidden="true" />
        {feedbackLabel}
      </button>
      <ul className="text-ink-faint m-0 flex list-none flex-wrap items-center justify-center gap-x-3 gap-y-[5px] p-0 text-[11px]">
        <li className="inline-flex items-center gap-[5px]">
          <Tag className="size-[13px] shrink-0" aria-hidden="true" />
          {trust.free}
        </li>
        <li className="inline-flex items-center gap-[5px]">
          <Code className="size-[13px] shrink-0" aria-hidden="true" />
          {trust.openSource}
        </li>
        <li className="inline-flex items-center gap-[5px]">
          <ShieldCheck className="size-[13px] shrink-0" aria-hidden="true" />
          {trust.privacy}
        </li>
      </ul>
    </footer>
  );
}
