/*
 * Publish the built onboarding bundle into the Safari wrapper app's Xcode
 * project.
 *
 * `vite build` (see `../vite.config.ts`) emits exactly two files into
 * `apps/safari-onboarding/dist/`:
 *   - `onboarding.js`  — one self-contained ES module (React + @movar/ui +
 *                        this app, brand PNG inlined as a data URI)
 *   - `onboarding.css` — one stylesheet (Tailwind + tokens)
 *
 * This script copies both into the App target's Resources and (re)writes the
 * localized `Main.html` shells that the WKWebView loads. The shells are
 * IDENTICAL across locales — i18n now lives in the React layer, which picks
 * `en`/`uk` from `navigator.language`. We keep both `.lproj/Main.html` files
 * so the app stays a localized bundle (the presence of `uk.lproj` is what makes
 * WKWebView report a Ukrainian `navigator.language` on a Ukrainian device).
 *
 * The shell carries the same strict CSP as the old static screen
 * (`default-src 'self'`): the single JS + CSS are same-origin (`file://` from
 * the bundle) and the brand image is an inlined data: URI, so nothing the CSP
 * blocks remains.
 *
 * Output layout (relative to `Shared (App)/Resources/`):
 *   onboarding.js
 *   onboarding.css
 *   Base.lproj/Main.html   (English fallback / default region)
 *   uk.lproj/Main.html
 *
 * Both filenames are stable (no content hash) so the committed
 * `Movar.xcodeproj/project.pbxproj` references and these shells stay valid
 * across rebuilds.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RESOURCES = path.resolve(
  ROOT,
  '..',
  'extension',
  'safari',
  'Movar',
  'Shared (App)',
  'Resources',
);

/** Locales that get a `Main.html` shell. `Base` is Xcode's development-region
 *  fallback (English); `uk` mirrors the app's Ukrainian localization. */
const LPROJ_DIRS = ['Base.lproj', 'uk.lproj'] as const;

const JS_NAME = 'onboarding.js';
const CSS_NAME = 'onboarding.css';

function fail(message: string): never {
  process.stderr.write(`[movar:safari-onboarding-sync] ${message}\n`);
  process.exit(1);
}

const jsSrc = path.join(DIST, JS_NAME);
const cssSrc = path.join(DIST, CSS_NAME);
if (!existsSync(jsSrc) || !existsSync(cssSrc)) {
  fail(
    `missing build output in ${DIST}\n` +
      `Run \`pnpm --filter @movar/safari-onboarding build:bundle\` first.`,
  );
}

// Resources/ exists in the committed project, but create defensively so a
// fresh checkout / CI runner doesn't trip over a missing dir.
mkdirSync(RESOURCES, { recursive: true });

// 1. Copy the two bundle files to the top of Resources.
copyFileSync(jsSrc, path.join(RESOURCES, JS_NAME));
copyFileSync(cssSrc, path.join(RESOURCES, CSS_NAME));
process.stdout.write(`[movar:safari-onboarding-sync] copied ${JS_NAME} + ${CSS_NAME}\n`);

// 2. Write the (identical) localized Main.html shells. `../` because each
//    shell sits one level down in a `.lproj/` dir; the bundle lives at the
//    Resources root.
const shell = buildShell();
for (const lproj of LPROJ_DIRS) {
  const dir = path.join(RESOURCES, lproj);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Main.html'), shell, 'utf8');
  process.stdout.write(`[movar:safari-onboarding-sync] wrote ${lproj}/Main.html\n`);
}

/**
 * The minimal CSP-safe HTML shell. Mirrors the old static head (charset, CSP,
 * non-zoomable viewport, title) but the body is just a React mount point plus
 * the bundled stylesheet + module — no inline script (CSP forbids it), no
 * inlined SVG sprite (icons now ship inside the JS as lucide-react components).
 */
function buildShell(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'" />

    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <title>Movar</title>

    <!--
      Onboarding screen for the Safari Web Extension wrapper app. The static
      Main.html / Style.css / Script.js this replaced are GENERATED from the
      React app in apps/safari-onboarding — edit there, not here, then run
      \`pnpm --filter @movar/safari-onboarding build\`.

      \`<html lang>\` is overwritten at runtime by main.tsx to the resolved
      locale (en/uk from navigator.language) for VoiceOver.
    -->
    <link rel="stylesheet" href="../${CSS_NAME}" />
    <script type="module" src="../${JS_NAME}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
}
