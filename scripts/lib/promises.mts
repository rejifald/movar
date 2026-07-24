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
import { resolve, dirname } from 'node:path';

/** Find the monorepo root by walking up from `start` (default: the process cwd)
 *  until the `pnpm-workspace.yaml` marker. Robust to BUNDLING — a build-time
 *  caller (the Astro transparency page) gets its modules bundled into `dist/`,
 *  so `import.meta.url` no longer points at the source tree — and to whatever
 *  working directory the build runs from. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  while (!existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
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
  const license = readFileSync(resolve(repoRoot, 'LICENSE'), 'utf8');
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
  if (
    !hero?.badge?.privacy ||
    !hero.badge.openSource ||
    !Array.isArray(limitations?.items) ||
    limitations.items.length === 0 ||
    !howItWorks?.steps?.[1]?.note
  ) {
    throw new Error(
      '[promises] expected marketing promise anchors are missing from apps/marketing/src/i18n.ts ' +
        '(hero.badge.privacy/openSource, limitations.items, howItWorks.steps[1].note) — ' +
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

/** Walk runtime extension source (no tests/preview/mocks) for any call that
 *  sends data off-device. Returns `file:line` strings for each hit. */
export function scanForEgress(repoRoot: string): string[] {
  const hits: string[] = [];
  const root = resolve(repoRoot, 'apps/extension/src');
  const egress =
    /\bfetch\s*\(|new\s+XMLHttpRequest|\bsendBeacon\s*\(|new\s+WebSocket|new\s+EventSource/;
  const skip = (name: string): boolean =>
    /\.(test|spec|stories)\.tsx?$/.test(name) || name === 'browser-mock.ts';
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'preview' && entry.name !== 'test' && !BUILD_DIRS.has(entry.name)) {
          walk(full);
        }
      } else if (/\.tsx?$/.test(entry.name) && !skip(entry.name)) {
        readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (egress.test(line)) hits.push(`${full.slice(repoRoot.length + 1)}:${i + 1}`);
          });
      }
    }
  };
  walk(root);
  return hits;
}

function verifyNetworkSilent(repoRoot: string): PromiseCheck {
  const reasons: string[] = [];

  const config = readFileSync(resolve(repoRoot, 'apps/extension/wxt.config.ts'), 'utf8');
  if (!/data_collection_permissions:\s*\{\s*required:\s*\[\s*'none'\s*\]/.test(config)) {
    reasons.push("manifest no longer declares data_collection_permissions required: ['none']");
  }

  const pkg = JSON.parse(
    readFileSync(resolve(repoRoot, 'apps/extension/package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const TELEMETRY = ['posthog', 'mixpanel', 'amplitude', '@sentry', 'segment', 'analytics', 'gtag'];
  const tracking = deps.filter((d) => TELEMETRY.some((t) => d.toLowerCase().includes(t)));
  if (tracking.length)
    reasons.push(`tracking/analytics dependency present: ${tracking.join(', ')}`);

  const egress = scanForEgress(repoRoot);
  if (egress.length) {
    reasons.push(
      `network-egress call(s) in extension source: ${egress.slice(0, 3).join(', ')}${egress.length > 3 ? ', …' : ''}`,
    );
  }

  const kept = reasons.length === 0;
  return {
    claim: 'Nothing leaves your browser',
    source: 'hero badge + OG card + privacy section + limitations',
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
  const src = readFileSync(resolve(repoRoot, 'packages/settings/src/index.ts'), 'utf8');
  const literal = /export const defaultSettings[\s\S]*?\n};/.exec(src)?.[0] ?? '';
  const off = /contentModification:\s*false\b/.test(literal);
  return {
    claim: 'On-page filtering stays off until you turn it on',
    source: 'how-it-works step 2 + limitations',
    kept: off,
    detail: off
      ? '`defaultSettings.contentModification` is false in @movar/settings — DOM filtering ships opt-in'
      : '`defaultSettings.contentModification` is not false — on-page filtering would be on by default',
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
    verifyNetworkSilent(repoRoot),
    verifyContentFilterOff(repoRoot),
  ];
}
