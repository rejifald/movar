/* eslint-disable @typescript-eslint/no-magic-numbers, no-console, sonarjs/no-os-command-from-path -- orchestration script: shells out to xcrun/maestro/networksetup by name and prints progress; timeouts/buffers are inline on purpose */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { retrySync } from './retry';
import { out } from './sh';
import type { Locale } from './shots';

const simctl = (...args: string[]): string => out('xcrun', ['simctl', ...args]);

export interface ThrowawaySim {
  readonly udid: string;
  readonly name: string;
  readonly runtime: string;
  readonly runtimeName: string;
}

/** Newest available iOS runtime identifier, e.g. `com.apple.CoreSimulator.SimRuntime.iOS-26-3`. */
function latestIosRuntime(): { id: string; name: string } {
  const listing = JSON.parse(simctl('list', 'runtimes', 'available', '--json')) as {
    runtimes: { identifier: string; name: string; version: string; platform?: string }[];
  };
  const ios = listing.runtimes
    .filter((r) => r.identifier.includes('SimRuntime.iOS-'))
    .toSorted((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const best = ios[0];
  if (!best) throw new Error('No iOS simulator runtime installed (Xcode ▸ Settings ▸ Components).');
  return { id: best.identifier, name: best.name };
}

const LOCALE_PREFS: Record<Locale, { languages: string; locale: string }> = {
  uk: { languages: 'uk', locale: 'uk_UA' },
  en: { languages: 'en', locale: 'en_US' },
};

/**
 * Create a brand-new simulator. Never looks at, boots, or erases an existing
 * one: the only device this module ever touches is the one it just created.
 */
export function createThrowaway(deviceType: string, stamp: string): ThrowawaySim {
  const runtime = latestIosRuntime();
  const name = `movar-listing-${stamp}`;
  const udid = simctl('create', name, deviceType, runtime.id).trim();
  return { udid, name, runtime: runtime.id, runtimeName: runtime.name };
}

/**
 * Write language + locale into the device's global prefs BEFORE its first
 * boot, so the very first SpringBoard run is already in the target language
 * (no reboot, no flash of English in the status bar).
 */
export function presetLocale(sim: ThrowawaySim, locale: Locale): void {
  const prefs = LOCALE_PREFS[locale];
  const dir = path.join(
    os.homedir(),
    'Library/Developer/CoreSimulator/Devices',
    sim.udid,
    'data/Library/Preferences',
  );
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '.GlobalPreferences.plist');
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>AppleLanguages</key><array><string>${prefs.languages}</string></array>
<key>AppleLocale</key><string>${prefs.locale}</string>
</dict></plist>
`,
  );
}

export function boot(sim: ThrowawaySim): void {
  simctl('boot', sim.udid);
  simctl('bootstatus', sim.udid, '-b');
}

export function polish(sim: ThrowawaySim): void {
  simctl(
    'status_bar',
    sim.udid,
    'override',
    '--time',
    '9:41',
    '--batteryState',
    'discharging',
    '--batteryLevel',
    '100',
    '--cellularBars',
    '4',
    '--wifiBars',
    '3',
    '--dataNetwork',
    'wifi',
  );
  simctl('ui', sim.udid, 'appearance', 'light');
}

export function installApp(sim: ThrowawaySim, appPath: string): void {
  simctl('install', sim.udid, appPath);
}

export function installRootCert(sim: ThrowawaySim, caCertPath: string): void {
  simctl('keychain', sim.udid, 'add-root-cert', caCertPath);
}

/**
 * Relaunching Safari right after `terminate` can time out under load
 * (`openurl` → NSPOSIXErrorDomain code 60), so retry a few times first.
 */
export function openUrl(sim: ThrowawaySim, url: string): void {
  retrySync(() => simctl('openurl', sim.udid, url), { attempts: 3, waitMs: 5000 });
}

export function terminate(sim: ThrowawaySim, bundleId: string): void {
  try {
    simctl('terminate', sim.udid, bundleId);
  } catch {
    // Not running: the state wanted.
  }
}

/** `defaults read <suite>` inside the simulator (live, via cfprefsd), or why it could not. */
export function readDefaults(sim: ThrowawaySim, suite: string): string {
  try {
    return simctl('spawn', sim.udid, 'defaults', 'read', suite);
  } catch (error) {
    return `unreadable: ${(error as Error).message}`;
  }
}

export function screenshot(sim: ThrowawaySim, file: string): void {
  simctl('io', sim.udid, 'screenshot', '--type=png', file);
}

/** Version and build of the INSTALLED app, read from the device, not the build dir. */
export function installedVersion(
  sim: ThrowawaySim,
  bundleId: string,
): { version: string; build: string } {
  const container = simctl('get_app_container', sim.udid, bundleId).trim();
  const plist = path.join(container, 'Info.plist');
  const read = (key: string): string =>
    out('plutil', ['-extract', key, 'raw', '-o', '-', plist]).trim();
  return { version: read('CFBundleShortVersionString'), build: read('CFBundleVersion') };
}

/** Delete ONLY the device this run created (guards on the name prefix). */
export function destroy(sim: ThrowawaySim): void {
  if (!sim.name.startsWith('movar-listing-')) throw new Error(`refusing to delete ${sim.name}`);
  try {
    simctl('shutdown', sim.udid);
  } catch {
    // Already shut down.
  }
  simctl('delete', sim.udid);
}
