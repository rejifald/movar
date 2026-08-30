/*
 * Capture the macOS host app's App Store screenshots, from the app that ships.
 *
 * WHY THIS IS NOT THE iOS SCRIPT. `capture-host-app-screenshots.mts` drives the
 * iOS simulator with `simctl`, which can boot, launch and screenshot but cannot
 * TAP — so its host-app scenes are an operator's manual step, and it says so.
 * macOS has no `simctl`, and the obvious substitutes do not work from an
 * automation context:
 *
 *   - `screencapture -R x,y,w,h` photographs whatever Space the display is
 *     currently showing. The app's window is routinely not on it, and you get
 *     WALLPAPER at exactly the right dimensions — a failure that looks like a
 *     success until someone opens the file.
 *   - `screencapture -l<windowid>` is refused outright: "could not create image
 *     from window". Capturing another app's window needs more than the
 *     display-capture right.
 *
 * A UI test runs inside the app's own session, so `XCUIElement.screenshot()`
 * returns the window's real pixels with no Accessibility grant, no Space
 * juggling and nobody at the keyboard. The test is
 * `safari/Movar/ScreenshotsUITests/ScreenshotTests.swift`; this script runs it
 * once per locale and lifts the attachments out of the `.xcresult`.
 *
 * SIZE. The test resizes the window to 1280x800 POINTS and asserts the capture
 * is one of the four sizes the Mac App Store accepts. On a 2x Retina display
 * that lands on 2560x1600. On a 1x display it would be 1280x800 — also
 * accepted — but anything else FAILS THE TEST rather than writing a file App
 * Store Connect would reject weeks later.
 *
 * THE AUDIT SCENE IS PRE-RUN, and cannot be otherwise. Its report needs the
 * network; the consent sheet the app raises first never enters the accessibility
 * tree, so no test can click it; its confirm is a tinted row rather than a default
 * button, so Return does not fire it; and `AuditModel` keeps runs in memory only,
 * so one cannot be performed once and photographed later. Each of those is a
 * deliberate decision in the app and none should be changed for a screenshot. A
 * populated report has to be photographed by hand.
 *
 * APPEARANCE. The test refuses to run when the system appearance does not match
 * the set being captured — macOS goes dark in the evening, and the first run after
 * sunset produced a half-light, half-dark listing. Switch appearance in System
 * Settings, or set MOVAR_SHOT_APPEARANCE=Dark.
 *
 * Uploading is manual too — `scripts/apple-submit.mjs` handles versions, notes,
 * compliance and submission, and no screenshots at all.
 *
 * Usage (macOS only, needs Xcode and the Apple Developer account the wrapper
 * already builds against):
 *   pnpm --filter @movar/extension capture:macos-screenshots
 *   pnpm --filter @movar/extension capture:macos-screenshots --locale=uk
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = nodePath.join(extensionRoot, 'safari', 'Movar');
const derivedData = nodePath.join(extensionRoot, 'safari', 'build-uitest');
const outRoot = nodePath.join(extensionRoot, 'store-assets', 'screenshots', 'macos');

/** Locale code -> the directory the listing reads. Ukrainian leads, as ever. */
const LOCALES = ['uk', 'en'] as const;

/** Sizes the Mac App Store accepts. The test asserts this too; belt and braces. */
const ACCEPTED = new Set(['1280x800', '1440x900', '2560x1600', '2880x1800']);

if (process.platform !== 'darwin') {
  console.error('✗ macOS only: this drives xcodebuild and the real app.');
  process.exit(1);
}

const only = process.argv.find((a) => a.startsWith('--locale='))?.split('=')[1];
const locales = only ? [only] : [...LOCALES];

function xcodebuild(args: string[], env: NodeJS.ProcessEnv = {}) {
  execFileSync('xcodebuild', args, {
    cwd: projectDir,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

/** PNG dimensions straight out of the IHDR — no image dependency for a header read. */
function pngSize(file: string): string {
  const head = readFileSync(file).subarray(16, 24);
  return `${head.readUInt32BE(0)}x${head.readUInt32BE(4)}`;
}

console.log('==> building the UI test bundle');
xcodebuild([
  'build-for-testing',
  '-project',
  'Movar.xcodeproj',
  '-scheme',
  'Movar (macOS)',
  '-destination',
  'platform=macOS',
  '-derivedDataPath',
  derivedData,
  '-allowProvisioningUpdates',
]);

for (const locale of locales) {
  const resultPath = nodePath.join(derivedData, `shots-${locale}.xcresult`);
  const exportPath = nodePath.join(derivedData, `attachments-${locale}`);
  rmSync(resultPath, { recursive: true, force: true });
  rmSync(exportPath, { recursive: true, force: true });

  console.log(`\n==> capturing ${locale}`);
  // Xcode forwards TEST_RUNNER_-prefixed variables to the test process with the
  // prefix stripped; the test reads MOVAR_SHOT_LOCALE and launches the app with
  // `-AppleLanguages`, so the machine's own language is never touched.
  xcodebuild(
    [
      'test-without-building',
      '-project',
      'Movar.xcodeproj',
      '-scheme',
      'Movar (macOS)',
      '-destination',
      'platform=macOS',
      '-derivedDataPath',
      derivedData,
      '-resultBundlePath',
      resultPath,
    ],
    { TEST_RUNNER_MOVAR_SHOT_LOCALE: locale },
  );

  execFileSync(
    'xcrun',
    ['xcresulttool', 'export', 'attachments', '--path', resultPath, '--output-path', exportPath],
    {
      stdio: 'pipe',
    },
  );

  const manifest = JSON.parse(readFileSync(nodePath.join(exportPath, 'manifest.json'), 'utf8')) as {
    attachments?: { exportedFileName: string; suggestedHumanReadableName?: string }[];
  }[];

  const outDir = nodePath.join(outRoot, locale);
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const entry of manifest) {
    for (const attachment of entry.attachments ?? []) {
      // XCTest appends "_0_<uuid>" to the name the test set; the part before the
      // first underscore is the scene, which is what the listing wants to see.
      const scene = (attachment.suggestedHumanReadableName ?? '').split('_')[0];
      if (!scene) continue;

      const source = nodePath.join(exportPath, attachment.exportedFileName);
      const size = pngSize(source);
      if (!ACCEPTED.has(size)) {
        console.error(`✗ ${scene}: ${size} is not a size the Mac App Store accepts.`);
        process.exit(1);
      }

      const target = nodePath.join(outDir, `${scene.replace(`${locale}-`, '')}.png`);
      writeFileSync(target, readFileSync(source));
      console.log(`   ${nodePath.relative(extensionRoot, target)}  ${size}`);
      written += 1;
    }
  }

  if (written === 0) {
    console.error(
      `✗ ${locale}: the run produced no attachments. The usual cause is the appearance ` +
        `guard skipping the test because the system is in the other mode — check the ` +
        `xcodebuild output above for a skip, and see APPEARANCE in this file's header.`,
    );
    process.exit(1);
  }
}

console.log(`\n✓ macOS screenshots written under ${nodePath.relative(extensionRoot, outRoot)}/`);
console.log('  Upload them by hand in App Store Connect — apple-submit.mjs does not.');

// The exported bundles are large and reproducible; leave the tree clean.
for (const locale of locales) {
  rmSync(nodePath.join(derivedData, `shots-${locale}.xcresult`), { recursive: true, force: true });
  rmSync(nodePath.join(derivedData, `attachments-${locale}`), { recursive: true, force: true });
}
