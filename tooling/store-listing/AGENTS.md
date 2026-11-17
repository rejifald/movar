# @movar/store-listing — agent guide

The iPhone and iPad App Store listing, made from **real app screens**: real Safari on a throwaway
simulator, the real Movar extension acting on curated mock sites, framed by a browser-free
renderer. Private build tooling, never shipped in a product.

## The three stages

| Stage             | Code                   | Runs on                                                 | Output                                                    |
| ----------------- | ---------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Mock sites        | `src/mock/`            | anywhere                                                | an HTTPS MITM proxy serving fictional pages               |
| Capture           | `src/capture/`         | macOS + Xcode 26 + Maestro                              | raw PNGs (iPhone 1320×2868, iPad 2064×2752)               |
| Capture (desktop) | `src/capture/desktop/` | Linux (Firefox, Chrome for Testing) / macOS CI (Safari) | real browser windows 1440×900 + `<id>.json` `{chromeTop}` |
| Frame             | `src/render/`          | anywhere (CI: Linux)                                    | framed listing PNGs, contact sheet, measurements          |

**Recapture everything from the current source: one `workflow_dispatch` of
`.github/workflows/store-listing.yml`** (Actions ▸ Store listing ▸ Run workflow). It builds the
extension and Movar.app from the checked-out commit and runs every capture unattended: `capture`
(iPhone/iPad), `capture-desktop` (Firefox + Chrome × uk/en, artifacts
`store-listing-desktop-<browser>-<locale>`), `capture-mac` (Safari, uk + en, artifact
`store-listing-desktop-safari`). No manual step anywhere; a run that cannot assert a shot's state
fails instead of writing it. `frame` and `frame-desktop` frame what was captured, then `propose`
(dispatch only) places every framed set with `src/publish/place.ts` and opens a PR:
`app-store/{iphone-6.9,ipad-13,mac}/<locale>` (the Mac host-app shots 05–07 stay),
`firefox/<locale>` (AMO), `chrome/<locale>` (the Chrome bundle), and the movar.fyi drum WebPs. Review
the contact sheets in the run's artifacts before merging; the PR is opened with `GITHUB_TOKEN`,
so close and reopen it to run CI.

```sh
pnpm --filter @movar/store-listing check:mock-scenes         # real extension (Chromium) vs the mock pages
pnpm --filter @movar/store-listing capture --smoke-localhost --locale uk   # local mechanics check
pnpm --filter @movar/store-listing frame --captures <dir> --out <dir> --locale uk [--canvas ipad]
```

```sh
# desktop (one browser × locale); chrome/firefox need the MOVAR_E2E=1 build of apps/extension
pnpm --filter @movar/store-listing exec tsx src/capture/desktop/run.ts --browser chrome|firefox|safari --locale uk|en --out <dir>
# local mechanics check on a Mac: real extension + mock proxy, page viewport only, no machine changes
pnpm --filter @movar/store-listing exec tsx src/capture/desktop/run.ts --browser chrome --locale uk --out <dir> --viewport-only
```

Desktop capture (`src/capture/desktop/`): each run takes every shot twice, `-before` in a launch
without Movar (Firefox/Chrome: not installed; Safari: installed but switched off in Settings) and
after with Movar on and `contentModification: true`. Firefox is a stock Mozilla build driven over
WebDriver BiDi (no geckodriver); Chrome is Playwright's Chrome for Testing (branded Chrome ignores
`--load-extension`). Both run under a private Xvfb the script starts, in a throwaway profile with
the proxy, the mock CA (NSS database), first-run answers and Movar's toolbar button pinned; the
window is grabbed with `import -window`, and `chromeTop` = capture height − `innerHeight`,
measured per capture. Safari is driven through the accessibility API (`safari/ax.swift`,
compiled per run) and AppleScript; it runs only under `CI=true`, because it sets the display mode,
trusts the CA in the System keychain, sets the system proxy and AppleLanguages (each restored in a
`finally`). Its `chromeTop` comes from the web area's AX frame.

Devices: `capture --device iphone|ipad` (default iphone; `CAPTURE_DEVICES` in
`src/capture/shots.ts`) writes `<out>/<device>/<locale>/`. The setup flows tap two UISwitches
by screen position (a tap on the label doesn't flip one, and iPad Settings is a split view), so
each device carries its own `P_EXT_SWITCH` / `P_HOST_TOGGLE` points; every scroll centres its row
(iOS 26 floats a search bar over a list's bottom edge — a test holds the flows to it).

The full capture (`capture --locale uk`) needs the mock proxy set as the system proxy, which
the script does **only when `CI=true`** (the `store-listing` workflow on an ephemeral macOS
runner). Locally it refuses and prints the `networksetup` commands; run them yourself only on a
machine you own, then pass `--local-proxy-already-set`.

## Decided rules (owner, 2026-11-14/15). Don't reopen them in code

- **Real UI only.** Every screen is a simulator capture of Safari + Movar on mock data, at 09:41.
  Never a drawing, a Figma mock or an edited screenshot. Only the ground is AI-generated
  (`assets/grounds/`, provenance in its README).
- **Story:** search in Ukrainian → site opens in Ukrainian without a language pop-up → the site's
  language menu doesn't offer Russian → YouTube hides Russian videos. The headline names what
  the screen shows. Copy lives in `src/render/listing.config.ts` and needs owner sign-off.
- **Every shot is a before/after pair, shown as one phone split across ("halves", owner
  2026-11-15; replaced B1).** Both are real captures of the same mock page from one run:
  `<id>-before.png` with the extension still off, `<id>.png` with Movar on. One whole phone,
  centred, 84 px above the bottom; the after capture fills the screen above the seam, the before
  capture below it, both undimmed. Every shot splits at exactly half (`cut: 0.5`), each part
  from its own page top (the same opening lines in two languages; the before part starts under
  its status bar). Half or no split at all: no region cuts (owner, 2026-11-15). The seam is a thin
  dark line; the captions «● З МОВАРОМ» (accent dot) / «● БЕЗ МОВАРА» (`ink-soft` dot) stand
  rotated on the ground left of the phone, each beside its own part, so nothing covers the
  screen (separator direction C, owner 2026-11-15). YouTube's after taps the curtain's real
  «Приховати всі», so the Ukrainian video moves up into the Russian one's slot.
  The logo sits at the same height on every image; the headline sits tight above the phone.
- **Landscape canvases** (owner, 2026-11-17): `frame --canvas desktop` (1280×800, AMO + Chrome
  Web Store) and `--canvas mac` (2560×1600, Mac App Store, the host-app shots' size) frame a real whole-browser-window capture.
  Logo + headline in a left column, the window on the right split at half, the same rotated captions
  on the ground beside its left edge; no fake chrome (the capture has the real toolbar), a ~10 px
  (at 1280) corner and the same shadow. The after capture gives the top half with its toolbar; the
  before capture gives the bottom half from under ITS toolbar, so each capture needs its toolbar
  height in capture px: a `<id>.json` sidecar `{ "chromeTop": 87 }` beside the capture (and
  optionally `<id>-before.json`, else the after's value), or `--chrome-top <px>` as the default.
  No sidecar and no flag fails. No `screens/*.webp` for landscape. Code: `layout-landscape.ts`,
  `render-landscape.ts`, `measure-landscape.ts`; extra guards `window-clipped`, `window-overlap`,
  `chrome-top`.
- **The before gate is dimmed, never blurred** (owner, 2026-11-15): the language gate on
  `tochka24.example` must leave the Russian page readable behind it.
- **Mock sites** reproduce the real sites' DOM contracts (Google `#rso > [data-hveid]`,
  `m.youtube.com` `ytm-video-with-context-renderer`, hreflang + a picker on `tochka24.example`),
  styled after the Storybook backdrops. A request to a mocked host with no route is a miss, and
  a miss fails the capture. The proxy log is JSON lines appended as each request happens (the
  run reads it while the proxy still runs); a proxied run with zero recorded requests fails too.
  A frame run with a capture missing fails (pass the device/locale folder, `captures/iphone/uk`).
- **Phone:** `phoneShape(screenWidth, device)` in `src/render/devices.ts` is the only source of
  rim, bezel and radii (phones: edge ≈ 3.5 % of screen width, iPhone 17 Pro Max body 78.0 ×
  163.4 mm; the iPad Pro 13" (M5) keeps its physical ~8.4 mm edge and its own status-bar height).
  Shrink the screen to fit, never thin the bezel. The renderer draws no Dynamic Island on App
  Store shots, but iOS 26 bakes the real island into the simulator capture, and that one stays:
  it is real UI, and removing it would be an edited screenshot (owner, 2026-11-15).
  The phone is shown whole. 84 px min side gap at 1320.
- **Guards fail the render:** picture > 0.5 % off its PNG ratio, body > 0.5 % off the device,
  side gap below the minimum, phone not whole, a split part under a quarter of the screen (or a
  before slice past its capture), a seam caption with no room on the ground beside the phone,
  before/after captures of different sizes, CTA over the phone,
  headline over 3 lines or into the logo, the logo moving between shots. `measure.ts` re-measures the PNG in pixels; trust that, not the layout numbers.
- **Byte-stable:** Satori + resvg, fonts from local files only (`src/render/fonts/`, Fixel OTF
  decoded from `packages/fonts`), `loadSystemFonts: false`.

## Gotchas

- The simulator build is **ad-hoc signed** (`CODE_SIGN_IDENTITY=-`), not unsigned: an unsigned
  build has no App Group container, so the host-app setting never reaches the extension.
- **Safari runs once before the host-app setting changes.** On the extension's first launch its
  install initialiser can race the adoption of a host-app change and write the defaults over it,
  so content hiding ends up off and no curtain appears. `runSetupFlows` opens a served page and
  waits 20 s between the two setup flows.
- iOS 26 Settings switches ignore taps on their labels; flows tap them by position. The host
  app's content toggle has no accessibility identifier yet.
- **Flow budgets are sized for CI, not a fast Mac:** one hierarchy read takes ~10 s on the macOS
  runner. Never a bare `assertVisible` after a navigation (use `extendedWaitUntil`, 60 s) and
  never a `scrollUntilVisible` budget under 90 s.
- Maestro needs Java 17+; `maestro.ts` falls back to Homebrew's openjdk. Under heavy load the
  driver can time out; `MAESTRO_DRIVER_STARTUP_TIMEOUT` is raised.
- Safari's first-run tip hides the page from the accessibility tree: every shot flow runs
  `_dismiss-tips.yaml` before asserting. It closes the tip by its ✕ id (`xmark.circle.fill`) in
  a loop until `TipView` is gone; one position tap during the entry animation can miss.
- Shot assertions match **accessibility labels** (e.g. «Мовар: приховано вміст…»), not visible
  text. `test/capture-shots.test.ts` pins them to the extension's own strings.
- **Desktop YouTube has no «Приховати всі»:** the curtain sheds its secondary action on a card
  under its `lg`×`xl` container band, and a desktop grid card is that small. The desktop `youtube`
  after therefore shows the Russian cards curtained (no tap), unlike the phone flow.
- WebDriver BiDi refuses to navigate to `moz-extension://`; Firefox settings are seeded from the
  options tab opened in the browser (chrome) realm, which needs `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`.
- A desktop browser's own requests to a mocked host count as misses: Chrome's omnibox suggest
  hit `www.google.com/complete/search` until the profile turned `search.suggest_enabled` off.
- Never touch a simulator this script didn't create: every throwaway sim is named
  `movar-listing-*` and deleted in a `finally`.
