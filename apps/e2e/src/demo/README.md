# `@movar/e2e/demo` — demo-video recording pipeline

POC scope: prove we can drive the live extension under Playwright, capture
the session as video, and derive the three publish formats (YouTube
master, README GIF, social cuts) from a single recording. **One beat
shipped**; the rest of the planned shotlist lands incrementally on top of
this scaffold.

## What's here

| File                              | Role                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `../../playwright.demo.config.ts` | Recording-only Playwright config (video on, 1280×800)        |
| `master.spec.ts`                  | One `test.describe('movar demo · <beat>')` per scripted beat |
| `cursor.ts`                       | Visible-cursor follower + `moveTo` helper                    |
| `Makefile`                        | ffmpeg derivations: master MP4 → YouTube, GIF, social cuts   |
| `captions/{uk,en}.srt`            | Burned-in caption sources for the social cuts                |

## Why these choices

- **Playwright over Remotion for v1.** The user-chosen polish level is
  "Playwright + light edit": real extension on real sites is the
  believable footage. Remotion stays a candidate if we ever need branded
  motion graphics around the captures.
- **Live DuckDuckGo search as the POC beat.** Reproducible from any IP
  (no geolocation dependency), no popup-UI capture needed (the
  extension's effect is visible on the URL bar), and exercises a real
  Movar rule — the DNR `kl=ua-uk` rewrite covered by
  [`apps/e2e/src/sites/duckduckgo.ts`](../sites/duckduckgo.ts). Google
  was the original pick but CAPTCHAs Playwright contexts unreliably
  (per the live-site suite README) — DDG is "the most automation-friendly
  of the four search engines" and runs end-to-end in ~9 sec.
- **Visible cursor injection.** Playwright's `mouse.move/click` dispatches
  synthetic events but the host browser never paints a system cursor —
  videos otherwise show the popup opening "by magic". `cursor.ts` injects
  a DOM follower that tracks the simulated coordinates 1:1.
- **WebM → MP4 in a separate ffmpeg pass.** Playwright records WebM at
  viewport resolution; downstream platforms want MP4. The Makefile lets
  us re-derive cuts without re-recording.

## Run it

One-time setup (the e2e package already has Playwright + chromium):

```bash
brew install ffmpeg
```

End-to-end (records, then derives all outputs):

```bash
cd apps/e2e/src/demo
make record
```

Iterate without re-recording (e.g. tweaking captions):

```bash
make all       # derive every output
make hero      # README GIF only
make social    # square + vertical only
make youtube   # 1080p master only
```

English-locale social cuts:

```bash
make social LOCALE=en
```

Outputs land under `apps/e2e/src/demo/out/`.

## How to add a beat

Each scripted moment is one `test()` inside `master.spec.ts`. Pattern:

```ts
test('<beat name>', async ({ movarPage }) => {
  await installVisibleCursor(movarPage);
  // …drive the page with `moveTo()`, `keyboard.type()`, etc.
  // close on a held final frame so the editor has a cut point.
  await movarPage.waitForTimeout(1500);
});
```

Each beat lands in its own WebM under `demo-results/`. The Makefile
picks the largest WebM (the main page recording always dwarfs the
service-worker capture) — when adding the second beat, split `RAW`
into per-beat targets so derivations don't overwrite each other.

## What this POC does NOT cover

- **Popup UI in the video.** The extension's toolbar popup is not
  directly automatable from Playwright. When we want to show the popup,
  the simplest path is opening `chrome-extension://<id>/popup.html` in a
  second tab at 360×500 and compositing in post — out of POC scope.
- **Branded motion graphics, B-roll, transitions.** That's the Remotion
  path if/when we upgrade past "Playwright + light edit". A first cut of
  the README GIF and the YouTube master should be usable with no editor
  involvement at all.
- **Multi-locale automation.** Each `make` invocation produces one
  locale's social cuts. Easy to add `make social-all` if it becomes a
  routine.

## Planned beats (post-POC)

From the shotlist in the planning chat — each is a separate `test()`:

1. ✅ **Search hygiene** — DuckDuckGo query rewrite (this POC).
2. **Silent save** — open a bilingual UA news site (geolocation-fragile
   from outside UA; needs a proxy or a stable RU-default URL).
3. **Picker survivor** — open `electrica-shop.com.ua`, open its language
   picker, show RU dimmed and UA at the top.
4. **Configure in 10 seconds** — open `chrome-extension://<id>/options.html`,
   drag-reorder the priority list. Needs popup-id resolution.

Each beat is ~6–12 seconds; the assembled master targets ~45–60 sec.
