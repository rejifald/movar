/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { out, stream, log } from './sh';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
export const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');
export const BUNDLE_ID = 'fyi.movar.safari';

export function gitSha(): string {
  try {
    const sha = out('git', ['-C', REPO_ROOT, 'rev-parse', '--short=12', 'HEAD']).trim();
    const dirty = out('git', ['-C', REPO_ROOT, 'status', '--porcelain']).trim() ? '-dirty' : '';
    return `${sha}${dirty}`;
  } catch {
    return 'unknown';
  }
}

export function extensionVersion(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'apps/extension/package.json'), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

export function builtAppPath(derived: string): string {
  return path.join(derived, 'Build/Products/Release-iphonesimulator/Movar.app');
}

/**
 * Build the Safari web-extension resources and the iOS app (Release, simulator,
 * ad-hoc signed, see below) into `derived`. The resource trees are gitignored and empty on a
 * fresh checkout, so they are rebuilt first (same sequence as
 * scripts/prepare-safari-build.sh, steps 2-4, plus the theme CSS they import).
 */
export function build(derived: string): string {
  const version = extensionVersion();
  const steps: [string, string[]][] = [
    ['pnpm', ['gen:theme']],
    ['pnpm', ['--filter', '@movar/extension', 'build:safari']],
    ['pnpm', ['--filter', '@movar/safari-host-app', 'build']],
    ['pnpm', ['--filter', '@movar/audit-engine', 'build']],
    [
      'xcodebuild',
      [
        'build',
        '-project',
        path.join(REPO_ROOT, 'apps/extension/safari/Movar/Movar.xcodeproj'),
        '-scheme',
        'Movar (iOS)',
        '-configuration',
        'Release',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        derived,
        // Ad-hoc, NOT CODE_SIGNING_ALLOWED=NO: a wholly unsigned simulator build carries
        // no entitlements, so the App Group never exists and the host app's settings
        // (content hiding) never reach the extension. Ad-hoc signing needs no account.
        'CODE_SIGN_IDENTITY=-',
        'CODE_SIGNING_ALLOWED=YES',
        'CODE_SIGNING_REQUIRED=YES',
        'CODE_SIGN_STYLE=Manual',
        'DEVELOPMENT_TEAM=',
        'PROVISIONING_PROFILE_SPECIFIER=',
        `MARKETING_VERSION=${version}`,
        'CURRENT_PROJECT_VERSION=1',
      ],
    ],
  ];
  for (const [cmd, args] of steps) {
    log(`▸ ${cmd} ${args.slice(0, 4).join(' ')}…`);
    if (stream(cmd, args, { cwd: REPO_ROOT }) !== 0) throw new Error(`${cmd} ${args[0]} failed`);
  }
  const app = builtAppPath(derived);
  if (!existsSync(app)) throw new Error(`build finished but ${app} is missing`);
  return app;
}
