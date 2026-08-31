/**
 * The machine-verified marketing promises, extracted so BOTH the README badge
 * generator (`scripts/gen-readme-metrics.mts`) and the public transparency page
 * (`apps/marketing/src/pages/transparency.astro`) consume one source — the badge
 * and the page can never diverge.
 *
 * Side-effect-free and path-explicit: every reader takes `repoRoot` so the same
 * module works whether it's invoked from `scripts/` (tsx) or from the Astro
 * build under `apps/marketing/`. Nothing is written here.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import nodePath from 'node:path';

/** Find the monorepo root by walking up from `start` (default: the process cwd)
 *  until the `pnpm-workspace.yaml` marker. Robust to BUNDLING — a build-time
 *  caller (the Astro transparency page) gets its modules bundled into `dist/`,
 *  so `import.meta.url` no longer points at the source tree — and to whatever
 *  working directory the build runs from. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = nodePath.resolve(start);
  while (!existsSync(nodePath.resolve(dir, 'pnpm-workspace.yaml'))) {
    const parent = nodePath.dirname(dir);
    if (parent === dir) {
      throw new Error(
        '[promises] could not find the repo root (no pnpm-workspace.yaml above cwd).',
      );
    }
    dir = parent;
  }
  return dir;
}

/** A marketing claim from apps/marketing paired with the code invariant that
 *  backs it. `kept` is the live verdict; `detail` says what was checked. */
export interface PromiseCheck {
  claim: string;
  /** Where in the marketing site the claim is made. */
  source: string;
  kept: boolean;
  detail: string;
}

/**
 * The marketing copy the caller resolves with ITS OWN loader, so this module
 * stays free of dynamic `.ts` imports (which node can't load — only the
 * `tsx`-run README generator could; the Astro/vite build can't). The README
 * generator dynamic-imports `i18n.ts`; the transparency page passes its
 * vite-imported `strings.en`. Everything else is read from committed source by
 * `repoRoot` (node-safe `readFileSync`).
 */
export interface PromiseInputs {
  /** `apps/marketing` `strings.en` — the live marketing copy (promise anchors). */
  marketingEn: Record<string, unknown>;
}

const OSI_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
]);

/** Directories the source scans never descend into (build output, vendored). */
const BUILD_DIRS = new Set([
  'node_modules',
  '.output',
  'dist',
  '.nx',
  '.wxt',
  'coverage',
  '.turbo',
]);

/** SPDX id from the root LICENSE (e.g. "MIT"). Exported so the README license
 *  badge reads the same value the open-source promise verifies. */
export function readLicense(repoRoot: string): string {
  const license = readFileSync(nodePath.resolve(repoRoot, 'LICENSE'), 'utf8');
  const match = /^(\S+) License/m.exec(license);
  if (!match) throw new Error('[promises] could not read the SPDX id from LICENSE.');
  return match[1];
}

/**
 * Throw if the live marketing copy no longer makes one of the promised claims —
 * so a restructure that drops a claim fails loudly rather than silently checking
 * a promise the site no longer makes. (The caller reads `strings.en` and passes
 * it in; this just validates the structure.)
 */
function assertMarketingAnchors(en: Record<string, unknown>): void {
  const hero = en['hero'] as { badge?: { privacy?: string; openSource?: string } } | undefined;
  const limitations = en['limitations'] as { items?: unknown[] } | undefined;
  const howItWorks = en['howItWorks'] as { steps?: { note?: string }[] } | undefined;
  const footer = en['footer'] as { credits?: string } | undefined;
  if (
    !hero?.badge?.privacy ||
    !hero.badge.openSource ||
    !Array.isArray(limitations?.items) ||
    limitations.items.length === 0 ||
    !howItWorks?.steps?.[1]?.note ||
    !footer?.credits
  ) {
    throw new Error(
      '[promises] expected marketing promise anchors are missing from apps/marketing/src/i18n.ts ' +
        '(hero.badge.privacy/openSource, limitations.items, ' +
        'howItWorks.steps[1].note, footer.credits) — ' +
        'update collectPromises() if the marketing copy was restructured.',
    );
  }
}

function verifyOpenSource(repoRoot: string): PromiseCheck {
  let spdx = '';
  try {
    spdx = readLicense(repoRoot);
  } catch {
    spdx = '';
  }
  const kept = OSI_LICENSES.has(spdx);
  return {
    claim: 'Open source',
    source: 'hero badge + footer',
    kept,
    detail: kept
      ? `root LICENSE is ${spdx}, an OSI-approved open-source license`
      : `root LICENSE is missing or not an OSI license (read ${spdx || 'nothing'})`,
  };
}

/** Files that are authored but never shipped, so a pattern found in one proves
 *  nothing about the product: unit tests, Storybook stories, the popup preview's
 *  WebExtension shim. */
const isAuthoringOnlyFile = (name: string): boolean =>
  /\.(test|spec|stories)\.[jt]sx?$/.test(name) || name === 'browser-mock.ts';

/**
 * Walk the shipped source under `root` and return `file:line` for every line
 * matching `pattern`. Shared by both source-scanning promises so they agree on
 * what counts as shipped: build output, vendored code, the extension's
 * `preview/` + `test/` fixtures, and authoring-only files are all skipped.
 *
 * A missing `root` yields no hits rather than throwing — the scans run against
 * synthetic fixture trees in the unit test, which carry only the directory the
 * case is about.
 */
function scanSource(repoRoot: string, root: string, sourceFile: RegExp, pattern: RegExp): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'preview' && entry.name !== 'test' && !BUILD_DIRS.has(entry.name)) {
          walk(full);
        }
      } else if (sourceFile.test(entry.name) && !isAuthoringOnlyFile(entry.name)) {
        readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (pattern.test(line)) hits.push(`${full.slice(repoRoot.length + 1)}:${i + 1}`);
          });
      }
    }
  };
  if (existsSync(root)) walk(root);
  return hits;
}

const EGRESS_CALL =
  /\bfetch\s*\(|new\s+XMLHttpRequest|\bsendBeacon\s*\(|new\s+WebSocket|new\s+EventSource/;

/** Walk runtime extension source (no tests/preview/mocks) for any call that
 *  sends data off-device. Returns `file:line` strings for each hit. */
export function scanForEgress(repoRoot: string): string[] {
  return scanSource(
    repoRoot,
    nodePath.resolve(repoRoot, 'apps/extension/src'),
    /\.tsx?$/,
    EGRESS_CALL,
  );
}

function verifyNetworkSilent(repoRoot: string): PromiseCheck {
  const reasons: string[] = [];

  const config = readFileSync(nodePath.resolve(repoRoot, 'apps/extension/wxt.config.ts'), 'utf8');
  if (!/data_collection_permissions:\s*\{\s*required:\s*\[\s*'none'\s*\]/.test(config)) {
    reasons.push("manifest no longer declares data_collection_permissions required: ['none']");
  }

  const pkg = JSON.parse(
    readFileSync(nodePath.resolve(repoRoot, 'apps/extension/package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const TELEMETRY = ['posthog', 'mixpanel', 'amplitude', '@sentry', 'segment', 'analytics', 'gtag'];
  const tracking = deps.filter((d) => TELEMETRY.some((t) => d.toLowerCase().includes(t)));
  if (tracking.length > 0)
    reasons.push(`tracking/analytics dependency present: ${tracking.join(', ')}`);

  const egress = scanForEgress(repoRoot);
  if (egress.length > 0) {
    reasons.push(
      `network-egress call(s) in extension source: ${egress.slice(0, 3).join(', ')}${egress.length > 3 ? ', …' : ''}`,
    );
  }

  const kept = reasons.length === 0;
  return {
    claim: 'Nothing leaves your browser',
    source: 'hero badge + OG card + privacy section',
    kept,
    detail: kept
      ? "manifest declares data collection 'none', no analytics dependency, and no fetch/XHR/WebSocket/sendBeacon in the extension runtime"
      : reasons.join('; '),
  };
}

function verifyContentFilterOff(repoRoot: string): PromiseCheck {
  // Read the committed source rather than importing it — keeps the module
  // node-safe (no dynamic `.ts` import). Scope to the `defaultSettings` object
  // literal so the `MovarSettings` interface's `contentModification: boolean`
  // type line can't be mistaken for the value.
  const src = readFileSync(nodePath.resolve(repoRoot, 'packages/settings/src/index.ts'), 'utf8');
  const literal = /export const defaultSettings[\s\S]*?\n};/.exec(src)?.[0] ?? '';
  const off = /contentModification:\s*false\b/.test(literal);
  return {
    claim: 'On-page filtering stays off until you turn it on',
    source: 'how-it-works step 2 + its refusals block',
    kept: off,
    detail: off
      ? '`defaultSettings.contentModification` is false in @movar/settings — DOM filtering ships opt-in'
      : '`defaultSettings.contentModification` is not false — on-page filtering would be on by default',
  };
}

/**
 * Dependency-name fragments that would mean money changes hands: payment
 * processors, ad and affiliate networks, subscription/entitlement SDKs. Matched
 * against dependency NAMES the same way the telemetry list above is.
 *
 * Donation platforms (GitHub Sponsors, Ko-fi, Patreon) are deliberately ABSENT.
 * "Non-commercial" here means Movar sells nothing — no paid tier, no ads, no
 * data — not that no money may ever support the work. A donate link would not
 * make the claim false, so it must not fail the check.
 */
const MONETIZATION_DEPS = [
  'stripe',
  'paddle',
  'lemonsqueezy',
  'gumroad',
  'revenuecat',
  'braintree',
  'paypal',
  'adsense',
  'admob',
  'carbonads',
  'buysellads',
  'taboola',
  'outbrain',
  'affiliate',
  'monetiz',
  'in-app-purchase',
];

/** Ad networks and payment processors, as they appear in a script `src`, an
 *  iframe, or a checkout URL. Same reasoning as {@link MONETIZATION_DEPS}: a
 *  bundled SDK is one way to monetise, a remote script tag is the other. */
const AD_OR_PAYMENT_HOST =
  /googlesyndication|doubleclick|googleadservices|adservice\.google|carbonads|buysellads|taboola|outbrain|stripe\.com|paypal\.com|paddle\.com|gumroad\.com|lemonsqueezy/i;

/** A settings field that would gate a feature behind a purchase. Anchored to a
 *  field declaration (`name:` at the start of a line) so the prose in a JSDoc
 *  comment can't trip it. */
const PAID_TIER_FIELD =
  /^\s*(isPro|isPremium|premium|paidTier|paid|tier|plan|subscription|entitlement|licen[cs]eKey|trial\w*)\??\s*:/m;

/** Every workspace manifest: the root, plus each direct child of `apps/` and
 *  `packages/`. A monetisation SDK anywhere in the tree breaks the claim, not
 *  just one in the extension. */
function workspaceManifests(repoRoot: string): string[] {
  const manifests = [nodePath.resolve(repoRoot, 'package.json')];
  for (const group of ['apps', 'packages']) {
    const dir = nodePath.resolve(repoRoot, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || BUILD_DIRS.has(entry.name)) continue;
      const manifest = nodePath.resolve(dir, entry.name, 'package.json');
      if (existsSync(manifest)) manifests.push(manifest);
    }
  }
  return manifests;
}

/** Dependency names across the workspace that match {@link MONETIZATION_DEPS},
 *  as `<workspace>: <dependency>` strings. Exported so the unit test can plant
 *  a violation and assert the scanner reports it. */
export function scanForMonetization(repoRoot: string): string[] {
  const hits: string[] = [];
  for (const manifest of workspaceManifests(repoRoot)) {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const dep of deps) {
      if (MONETIZATION_DEPS.some((m) => dep.toLowerCase().includes(m))) {
        hits.push(`${pkg.name ?? manifest.slice(repoRoot.length + 1)}: ${dep}`);
      }
    }
  }
  return hits;
}

/** Walk the shipped extension AND marketing source for a reference to an ad
 *  network or a payment processor — the remote-script half of monetisation, the
 *  half {@link scanForMonetization}'s dependency read can't see. Returns
 *  `file:line` strings for each hit. The site is scanned as well as the
 *  extension: the network-silence promise covers only the extension, so an ad
 *  tag on movar.fyi would otherwise pass every existing check. */
export function scanForCommercialHosts(repoRoot: string): string[] {
  return [
    ...scanSource(
      repoRoot,
      nodePath.resolve(repoRoot, 'apps/extension/src'),
      /\.tsx?$/,
      AD_OR_PAYMENT_HOST,
    ),
    ...scanSource(
      repoRoot,
      nodePath.resolve(repoRoot, 'apps/marketing/src'),
      /\.(tsx?|astro)$/,
      AD_OR_PAYMENT_HOST,
    ),
  ];
}

/**
 * "Movar is non-commercial" — no paid tier, no premium features, no ads, no
 * data for sale.
 *
 * Three mechanical reads back it, each covering a different way the claim could
 * quietly stop being true: a monetisation SDK entering the dependency tree, a
 * paid-tier flag entering the settings schema (the only place a feature gate
 * could live, since there is no server to hold one), and an ad network or
 * checkout host entering the extension or the site's source.
 *
 * Note this is a claim about how the PROJECT is run, not a licence term: the
 * root LICENSE is MIT and grants commercial use to everyone, Movar included.
 * The promise is that Movar does not exercise it.
 */
function verifyNonCommercial(repoRoot: string): PromiseCheck {
  const reasons: string[] = [];

  const monetized = scanForMonetization(repoRoot);
  if (monetized.length > 0) {
    reasons.push(`payment/ads/affiliate dependency present: ${monetized.join(', ')}`);
  }

  const settings = readFileSync(
    nodePath.resolve(repoRoot, 'packages/settings/src/index.ts'),
    'utf8',
  );
  const schema = /export interface MovarSettings[\s\S]*?\n}/.exec(settings)?.[0] ?? '';
  const gate = PAID_TIER_FIELD.exec(schema);
  if (gate) reasons.push(`the settings schema gained a paid-tier field: \`${gate[1]}\``);

  const hosts = scanForCommercialHosts(repoRoot);
  if (hosts.length > 0) {
    reasons.push(
      `ad/payment host referenced in shipped source: ${hosts.slice(0, 3).join(', ')}${hosts.length > 3 ? ', …' : ''}`,
    );
  }

  const kept = reasons.length === 0;
  return {
    claim: 'Non-commercial',
    source: 'footer + feedback section',
    kept,
    detail: kept
      ? 'no payment, advertising, or affiliate dependency in any workspace package; no paid-tier field in the settings schema; and no ad or checkout host in the extension or site source — there is nothing to buy and nothing about you to sell'
      : reasons.join('; '),
  };
}

/**
 * The marketing promises Movar makes, each verified against committed code.
 * Side-effect-free + node-safe (no dynamic `.ts` imports): the caller supplies
 * the two TS-derived inputs (see {@link PromiseInputs}) and `repoRoot`, so this
 * runs identically under the tsx README generator and the Astro/vite build.
 */
export function collectPromises(repoRoot: string, inputs: PromiseInputs): PromiseCheck[] {
  assertMarketingAnchors(inputs.marketingEn);
  return [
    verifyOpenSource(repoRoot),
    verifyNonCommercial(repoRoot),
    verifyNetworkSilent(repoRoot),
    verifyContentFilterOff(repoRoot),
  ];
}
