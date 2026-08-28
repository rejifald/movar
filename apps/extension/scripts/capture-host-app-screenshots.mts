/*
 * Capture the REAL Movar host-app UI as App Store screenshots for the iOS +
 * iPadOS listings — from the NATIVE app running in a simulator.
 *
 * WHY THIS DRIVES A SIMULATOR AND NOT A HEADLESS BROWSER. It used to load
 * `@movar/safari-host-app`'s built bundle in Chromium at the device's logical
 * size and screenshot the About tab. That stopped being a picture of the app the
 * moment the Swift shell finished going native (`docs/native-shells.md`): all
 * three tabs are SwiftUI now, About is a screen behind Settings rather than a
 * tab, and the enable path moved onto the Settings setup banner. The React
 * bundle still BUILDS — `ViewController` loads it for the `readSettings` /
 * `writeSettings` bridge — but nothing displays it, so a screenshot of it was a
 * picture of a screen no reviewer and no user can reach. App Store screenshots
 * have to depict the app as it ships (Guideline 2.3.3), which makes "render the
 * retired page" not a shortcut but a wrong answer.
 *
 * WHAT IS AUTOMATED AND WHAT IS NOT. `simctl` can boot, install, launch (with a
 * locale) and screenshot, and all of that is `--prepare` / `--capture` below. It
 * cannot TAP: there is no gesture primitive in `simctl`, and the two scenes here
 * live two and three taps inside the app. So navigation is the operator's step —
 * put the app on the screen you want, then run `--capture`. The durable fix is a
 * UI-test target driving `XCUIScreen.main.screenshot()`; that is a project-file
 * change this script deliberately does not make.
 *
 * WHAT THE SCRIPT STILL GUARANTEES, which is the part worth having: the output
 * is written at Apple's exact device pixel size or not at all (a shot from the
 * wrong simulator is rejected here rather than by App Store Connect), and the
 * alpha channel is flattened to match the rest of the committed set.
 *
 * Typical run, one scene:
 *   # build the simulator app once (see store-assets/README.md for the full
 *   # bootstrap — theme, extension, host bundle, audit engine):
 *   xcodebuild build -project "safari/Movar/Movar.xcodeproj" -scheme "Movar (iOS)" \
 *     -configuration Debug -destination "id=<udid>" \
 *     -derivedDataPath "safari/Movar/DerivedData" CODE_SIGNING_ALLOWED=NO
 *
 *   pnpm --filter @movar/extension capture:host-app-screenshots --prepare --device=ios --locale=uk
 *   # …navigate to the scene in the simulator…
 *   pnpm --filter @movar/extension capture:host-app-screenshots --device=ios --locale=uk --scene=09-host-app-setup
 */
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const SCREENSHOTS_DIR = path.resolve(extensionRoot, 'store-assets', 'screenshots');

/** The built simulator app `--prepare` installs. Gitignored build output. */
const SIMULATOR_APP = path.resolve(
  extensionRoot,
  'safari',
  'Movar',
  'DerivedData',
  'Build',
  'Products',
  'Debug-iphonesimulator',
  'Movar.app',
);

const BUNDLE_ID = 'fyi.movar.safari';

/**
 * The two App Store device classes, and the simulators that render at their
 * exact pixel size.
 *
 * `sizes` is a LIST because Apple accepts more than one raster for the 13″ iPad
 * slot: 2048×2732 is the old 12.9″ iPad Pro and 2064×2752 the current 13″ one,
 * and which you get depends on which simulator Xcode ships. Both are valid; a
 * third size is a wrong device, and the point of checking is to catch that
 * before App Store Connect does.
 */
const DEVICES = {
  ios: {
    /** Any simulator whose screen is this size — 440×956 @3×. */
    sizes: [[1320, 2868]],
    simulator: 'iPhone 17 Pro Max',
  },
  ipad: {
    /** 1024×1366 @2× (12.9″) or 1032×1376 @2× (13″). */
    sizes: [
      [2048, 2732],
      [2064, 2752],
    ],
    simulator: 'iPad Pro 13-inch (M5)',
  },
} as const;

type DeviceKey = keyof typeof DEVICES;

/**
 * The locales the listing ships, and the `AppleLanguages` each one launches
 * with.
 *
 * Ukrainian leads because the listing does — see the bilingual store-copy rule
 * in `store-assets/README.md`. The tag is passed to the APP rather than set on
 * the device on purpose: it is one launch instead of a device reboot. The
 * trade-off shows on iPad, whose status bar carries a date — a device left in
 * Ukrainian stamps «Чт 27 серп.» across an English screenshot — so for the iPad
 * `en` shots set the DEVICE language too:
 *
 *   xcrun simctl spawn <udid> defaults write ".GlobalPreferences" AppleLanguages -array en-US
 *   xcrun simctl shutdown <udid> && xcrun simctl boot <udid>
 */
const LOCALES = {
  uk: '("uk")',
  en: '("en-US")',
} as const;

type LocaleKey = keyof typeof LOCALES;

/**
 * The scenes this script writes, and what each is evidence OF.
 *
 * Both were one scene when About was a React tab that carried the brand lede AND
 * the enable path. Going native split them: About kept the lede, the licence and
 * the support links, while "One last step" — the Settings ▸ Apps ▸ Safari ▸
 * Extensions ▸ Movar route, which is the visible Guideline 4.2 evidence — became
 * the setup banner at the top of Settings. One screenshot can no longer show
 * both, so there are two.
 *
 * The setup banner is only on screen while the reader has NOT tapped "I've done
 * this" (`about.setupCardDismissed` in the app's own `UserDefaults`), so capture
 * it against a fresh install — `--prepare` reinstalls for exactly this reason.
 */
const SCENES = ['08-host-app-about', '09-host-app-setup'] as const;

function simctl(args: string[]): string {
  return execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });
}

/** The udid of a booted simulator with this name, booting one if needed. */
function resolveDevice(name: string): string {
  const listing = JSON.parse(simctl(['list', 'devices', 'available', '--json'])) as {
    devices: Record<string, { udid: string; name: string; state: string }[]>;
  };
  const match = Object.values(listing.devices)
    .flat()
    .find((device) => device.name === name);
  if (!match) {
    throw new Error(
      `No available simulator named "${name}". Install it in Xcode ▸ Settings ▸ Components, ` +
        'or capture on another device of the same class and check the size the shot comes out at.',
    );
  }
  if (match.state !== 'Booted') {
    console.log(`  ⏳ booting ${name}…`);
    simctl(['boot', match.udid]);
    simctl(['bootstatus', match.udid, '-b']);
  }
  return match.udid;
}

/**
 * Boot the device, reinstall the app, and launch it in one locale.
 *
 * REINSTALL rather than launch: it drops the app's container, which is what
 * resets `about.setupCardDismissed` so the setup banner is on screen again. A
 * device that has run Movar before otherwise shows a Settings screen with no
 * banner and the scene silently cannot be shot.
 */
function prepare(device: DeviceKey, locale: LocaleKey): void {
  const udid = resolveDevice(DEVICES[device].simulator);
  console.log(`▶ Preparing ${device}/${locale} on ${DEVICES[device].simulator} (${udid})`);
  try {
    simctl(['uninstall', udid, BUNDLE_ID]);
  } catch {
    // Not installed — the state this is trying to reach anyway.
  }
  simctl(['install', udid, SIMULATOR_APP]);
  simctl(['launch', udid, BUNDLE_ID, '-AppleLanguages', LOCALES[locale]]);
  console.log(`✓ Launched. Navigate to the scene, then re-run with --scene=<${SCENES.join('|')}>.`);
}

/**
 * Screenshot whatever the device is showing, size-check it, and write it.
 *
 * `simctl io screenshot` is a native device-pixel grab, so the raster is the
 * App Store size with no scaling step to get wrong — which is also why an
 * unexpected size means the wrong simulator rather than a bad crop, and is
 * refused instead of resized.
 */
async function capture(device: DeviceKey, locale: LocaleKey, scene: string): Promise<void> {
  const udid = resolveDevice(DEVICES[device].simulator);
  const outDir = path.resolve(SCREENSHOTS_DIR, device, locale);
  await mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, `${scene}.png`);

  // stderr piped rather than inherited: `simctl io … -` reports "Wrote
  // screenshot to: -" on success, which is noise here — but it is also where a
  // real failure explains itself, and `execFileSync` hands it back on throw.
  const raw = execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', '-'], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { width, height } = await sharp(raw).metadata();
  const accepted = DEVICES[device].sizes;
  if (!accepted.some(([w, h]) => w === width && h === height)) {
    throw new Error(
      `${DEVICES[device].simulator} produced ${width}×${height}, which is not an App Store ` +
        `${device} size (${accepted.map(([w, h]) => `${w}×${h}`).join(' or ')}). Wrong simulator.`,
    );
  }

  // Flatten so the file is 24-bit no-alpha, matching the rest of the store set
  // (App Store Connect rejects screenshots with an alpha channel).
  await sharp(raw).flatten({ background: '#ffffff' }).png().toFile(outPath);
  console.log(
    `  📸 ${device}/${locale} (${width}×${height}) → ${path.relative(extensionRoot, outPath)}`,
  );
}

function flag(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const device = flag('device') as DeviceKey | undefined;
  const locale = flag('locale') as LocaleKey | undefined;
  const scene = flag('scene');

  if (!device || !(device in DEVICES)) {
    throw new Error(`--device is required, one of: ${Object.keys(DEVICES).join(', ')}`);
  }
  if (!locale || !(locale in LOCALES)) {
    throw new Error(`--locale is required, one of: ${Object.keys(LOCALES).join(', ')}`);
  }

  if (process.argv.includes('--prepare')) {
    prepare(device, locale);
    return;
  }

  if (!scene) {
    throw new Error(
      `--scene is required, one of: ${SCENES.join(', ')} (or --prepare to boot + install first)`,
    );
  }
  if (!(SCENES as readonly string[]).includes(scene)) {
    console.warn(`⚠ "${scene}" is not one of the known scenes (${SCENES.join(', ')}).`);
  }
  await capture(device, locale, scene);
}

await main();
