import { Fragment } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  ArrowLeftRight,
  Code,
  CodeXml,
  Compass,
  ExternalLink,
  EyeOff,
  Globe,
  LayoutGrid,
  Mail,
  Puzzle,
  Settings,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandMark } from '@movar/ui';
import { openFeedback, openSafariPreferences, openSourceCode } from '../bridge';
import type { HostState } from '../bridge';
import type { HostMessages } from '../i18n';
import { APP_VERSION } from '../version';

/**
 * About tab — a document-flow column (matched to `gracious-bassi`): a brand
 * lede, the enablement banner, a "What Movar does" capability list, the trust
 * row, and a footer with the feedback + source-code links.
 *
 * The enablement banner is a pure function of the native {@link HostState} (the
 * `show()` feed), replacing the legacy CSS visibility rules with a data branch:
 *   - `state === null` (pre-`show()`) → banner hidden (lede + features + trust +
 *     links still render);
 *   - `platform === 'ios'` → "One last step" + the Settings → … → Extensions →
 *     Movar chip path, then the "turn it on, allow in Private Browsing" action.
 *     The path is version-branched off `state.iosMajor`: iOS 18+ includes the
 *     "Apps" hop (Settings → Apps → Safari), since that's where Apple moved app
 *     settings in iOS 18; earlier iOS (and an unknown/omitted version) drop it
 *     (Settings → Safari → Extensions → Movar);
 *   - `platform === 'mac'`, off → "One last step" + the "Open Safari Settings"
 *     CTA (`openSafariPreferences()`);
 *   - `platform === 'mac'`, on → "Movar is on" + a green status dot + the CTA.
 * `useSettings === false` (macOS ≤ 12) swaps "Settings" → "Preferences"
 * everywhere (chip label + CTA), exactly as the legacy `data-legacy` did.
 *
 * FOOTER LINKS — feedback and source-code, on every platform (matching
 * gracious-bassi's `.links` footer). Both route through the native bridge
 * ({@link openFeedback} → `'feedback'`, {@link openSourceCode} → `'open-url'`)
 * rather than plain anchors: under the WKWebView's `default-src 'self'` CSP a
 * Swift hand-off is the robust way to open an external `mailto:` / `https:` —
 * see `apps/safari-host-app/AGENTS.md` for the Swift cases the Xcode pass adds.
 *
 * Markup uses the host's ported `.about` / `.lede` / `.enable` / `.status` /
 * `.features` / `.feature` / `.trust` / `.links` classes (the app's `styles.css`
 * is this screen's source of truth).
 */
export interface AboutTabProps {
  /** Host-shell catalogue for the resolved locale — the lede + summary, the
   *  enablement copy, chip/CTA labels, the "What Movar does" features, the trust
   *  claims, and the footer link labels. */
  messages: HostMessages;
  /** Latest native `show()` snapshot, or `null` before the host reports. */
  state: HostState | null;
}

/** Icon per capability row, positionally aligned to `messages.about.features`
 *  (defaults → globe, switches → left-right, filters → eye-off). */
const FEATURE_ICONS: readonly LucideIcon[] = [Globe, ArrowLeftRight, EyeOff];

/** iOS 18 is where Apple moved app settings under a new "Apps" section
 *  (Settings ▸ Apps ▸ Safari); earlier iOS puts Safari at the Settings root, so
 *  the iOS enablement path shows the "Apps" hop only from this major up. */
const IOS_APPS_SECTION_MAJOR = 18;

export function AboutTab({ messages, state }: Readonly<AboutTabProps>): JSX.Element {
  const { about } = messages;
  return (
    <div className="card about">
      <div className="lede-block">
        <p className="lede">{about.lede}</p>
        <p className="lede-sub">{about.summary}</p>
      </div>

      {/* Live region: Swift reveals the real state asynchronously, so the swap
          is announced rather than landing silently. */}
      <div className="enable" aria-live="polite" aria-atomic="true">
        <StatusBanner messages={messages} state={state} />
      </div>

      <section className="sec what" aria-labelledby="what-title">
        <h2 id="what-title" className="sec-title">
          {about.whatTitle}
        </h2>
        <ul className="features sec-body">
          {about.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] ?? Globe;
            return (
              <li className="feature" key={feature.title}>
                <span className="badge">
                  <Icon className="ico" aria-hidden="true" />
                </span>
                <span className="feat-text">
                  <span className="feat-title">{feature.title}</span>
                  <span className="feat-desc">{feature.desc}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

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

      {/* Footer links — feedback + source, both routed through the native bridge
          (the CSP makes a Swift hand-off the robust escape). Buttons, not
          anchors, because they trigger a native action rather than navigating. */}
      <div className="links">
        <button type="button" className="link" onClick={openFeedback}>
          <Mail className="ico" aria-hidden="true" />
          {messages.feedback}
        </button>
        <button type="button" className="link" onClick={openSourceCode}>
          <CodeXml className="ico" aria-hidden="true" />
          {about.sourceCode}
        </button>
        {/* App version — the same string the popup/options footers show, baked
            in at build (see `version.ts`). Pushed to the trailing edge of the
            footer row; plain text, not a link. */}
        <span className="version">v{APP_VERSION}</span>
      </div>
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
    // Apple moved app settings under a new "Apps" section in iOS 18; before that
    // Safari sat at the Settings root. Include the "Apps" hop only where it
    // exists — iOS 18+, or when the host didn't report a version (dev/preview/
    // older host build), which we treat as modern so the current path shows.
    const hasAppsSection = state.iosMajor === undefined || state.iosMajor >= IOS_APPS_SECTION_MAJOR;
    const iosSteps: PathStep[] = [
      { icon: <Settings className="ico" aria-hidden="true" />, label: chips.settingsApp },
      ...(hasAppsSection
        ? [{ icon: <LayoutGrid className="ico" aria-hidden="true" />, label: chips.apps }]
        : []),
      { icon: <Compass className="ico" aria-hidden="true" />, label: chips.safari },
      { icon: <Puzzle className="ico" aria-hidden="true" />, label: chips.extensions },
      // The extension's own row — the Movar mark, as it appears in the list.
      { icon: <BrandMark outline className="ico" />, label: chips.movar },
    ];
    return (
      <Status headline={messages.ios.headline} helper={messages.ios.helper}>
        <Path then={messages.pathThen} steps={iosSteps} />
        {/* Once you reach Movar's row: turn it on, and allow it in Private
            Browsing (Safari keeps extensions off in private tabs by default) —
            reassured by the open-source + nothing-leaves-your-browser guarantees
            so that private-tab ask doesn't read as a privacy risk. */}
        <p className="helper">{messages.ios.action}</p>
      </Status>
    );
  }

  const macSteps: PathStep[] = [
    { icon: <Compass className="ico" aria-hidden="true" />, label: chips.safari },
    { icon: <Settings className="ico" aria-hidden="true" />, label: settingsLabel },
    { icon: <Puzzle className="ico" aria-hidden="true" />, label: chips.extensions },
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

/** One labelled step in the chip chain. `icon` is the already-rendered glyph
 *  (a lucide icon with `className="ico"`, or the `BrandMark` for the Movar
 *  step) so a step isn't limited to the lucide component shape. */
interface PathStep {
  icon: ReactNode;
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
function Chip({ icon, children }: Readonly<{ icon: ReactNode; children: ReactNode }>): JSX.Element {
  return (
    <span className="chip">
      {icon}
      {children}
    </span>
  );
}
