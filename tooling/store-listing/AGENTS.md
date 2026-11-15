# @movar/store-listing — agent guide

The iPhone App Store listing, made from **real app screens**: real Safari on a throwaway
simulator, the real Movar extension acting on curated mock sites, framed by a browser-free
renderer. Private build tooling, never shipped in a product.

## The three stages

| Stage      | Code           | Runs on                    | Output                                           |
| ---------- | -------------- | -------------------------- | ------------------------------------------------ |
| Mock sites | `src/mock/`    | anywhere                   | an HTTPS MITM proxy serving fictional pages      |
| Capture    | `src/capture/` | macOS + Xcode 26 + Maestro | raw 1320×2868 PNGs from one gated run            |
| Frame      | `src/render/`  | anywhere (CI: Linux)       | framed listing PNGs, contact sheet, measurements |

```sh
pnpm --filter @movar/store-listing check:mock-scenes         # real extension (Chromium) vs the mock pages
pnpm --filter @movar/store-listing capture --smoke-localhost --locale uk   # local mechanics check
pnpm --filter @movar/store-listing frame --captures <dir> --out <dir> --locale uk
```

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
- **Mock sites** reproduce the real sites' DOM contracts (Google `#rso > [data-hveid]`,
  `m.youtube.com` `ytm-video-with-context-renderer`, hreflang + a picker on `tochka24.example`),
  styled after the Storybook backdrops. A request to a mocked host with no route is a miss, and
  a miss fails the capture. The proxy log is JSON lines appended as each request happens (the
  run reads it while the proxy still runs); a proxied run with zero recorded requests fails too.
  A frame run with a capture missing fails (pass the locale folder, `captures/uk`).
- **Phone:** `phoneShape(screenWidth, device)` in `src/render/devices.ts` is the only source of
  rim, bezel and radii (edge ≈ 3.5 % of screen width; iPhone 17 Pro Max body 78.0 × 163.4 mm).
  Shrink the screen to fit, never thin the bezel. The renderer draws no Dynamic Island on App
  Store shots, but iOS 26 bakes the real island into the simulator capture, and that one stays:
  it is real UI, and removing it would be an edited screenshot (owner, 2026-11-15).
  Anchored to the bottom; only Safari's bottom toolbar strip may be cropped; 84 px min side gap
  at 1320.
- **Guards fail the render:** picture > 0.5 % off its PNG ratio, body > 0.5 % off the device,
  side gap below the minimum, CTA over content, headline over 3 lines, bezel showing under the
  screen. `measure.ts` re-measures the PNG in pixels; trust that, not the layout numbers.
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
- Never touch a simulator this script didn't create: every throwaway sim is named
  `movar-listing-*` and deleted in a `finally`.
