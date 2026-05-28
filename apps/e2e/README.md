# @movar/e2e — live-website end-to-end suite

> Run against the real internet. **Manual only**; not gated on PRs.

This suite verifies the four-part contract for every site that ships a
rule (or that we want generic-fallback coverage on):

1. **Opens in Russian** — the start URL serves RU content (`<html lang>`
   - body-text Cyrillic detection agree).
2. **Recognised** — Movar's `detectPageLanguage` logged `fromLang: 'ru'`
   for the domain in its correction-event store.
3. **Switched** — the final URL matches the fixture's `afterMovar.url`
   pattern, and `<html lang>` is `uk`.
4. **Hidden** — `data-movar-hidden` is populated on picker items
   (and/or `data-movar-curtain` for the YouTube content-filter blur).

## Sites covered

| Site                    | Kind   | What it tests                                           |
| ----------------------- | ------ | ------------------------------------------------------- |
| `electrica-shop.com.ua` | site   | `cookie + hreflang` rule + class-name picker classify   |
| `uamade.ua`             | site   | Generic hreflang fallback + CS-Cart `ty-select` picker  |
| `001.com.ua`            | site   | Generic hreflang fallback + bare-text `UA \| RU` picker |
| `duckduckgo.com`        | search | Enforce-mode `kl=ua-uk` URL rewrite                     |
| `bing.com`              | search | Enforce-mode `setlang=uk` URL rewrite                   |
| `google.com`            | search | Enforce-mode `hl + lr` URL rewrite                      |
| `youtube.com`           | search | Enforce `hl + gl` + DOM content-filter blur on RU cards |

To add another rule-bearing site: copy any file under `src/sites/`,
adjust the fixture, and re-export from `src/sites/index.ts`. The spec
picks it up automatically.

## Running

```bash
# One-time
pnpm install
pnpm --filter @movar/e2e install:browsers

# Build the extension and run the suite
pnpm test:e2e:live

# Headed mode for live debugging
pnpm --filter @movar/e2e test:live:headed

# Playwright UI mode
pnpm --filter @movar/e2e test:live:ui
```

The Nx target `e2e:test:live` declares `extension:build` as a
dependency, so the extension's WXT production output is always fresh
before tests run.

## A note on running from Ukraine

The three Ukrainian e-com sites (`electrica-shop`, `uamade`, `001`) all
server-side geolocate UA visitors to the UA version regardless of
`Accept-Language` or the `lang=ru` preCookie. From a Ukrainian IP, the
suite reports:

- Test 1 (baseline opens in Russian) — **skipped via tolerant fixture**:
  the `initial` expectations accept `uk` as a valid baseline. Movar's
  redirect path has nothing to fix here, which is correct.
- Test 2/3 (recognise + switch) — **explicitly skipped** with a clear
  message. The skip is honest: nothing to redirect from.
- Test 4 (hide blocked options) — **runs and passes**. The picker filter
  fires regardless of starting state, and is the user-facing UX you
  most want to verify on every run.

To fully exercise the redirect path, run the suite from a non-UA exit
point — either a VPN/proxy or a CI runner in another region. Playwright's
`launchPersistentContext` accepts a `proxy` option; threading it into
`src/fixtures/extension.ts` is a one-line change if you want a
`MOVAR_E2E_PROXY` env knob.

The search-engine tests (`google`, `youtube`, `bing`, `duckduckgo`)
are not affected by this — the enforce-mode rule fires unconditionally
on `/search` regardless of IP.

## Flake handling

Real sites flake. The suite mitigates rather than denies:

- **One worker, no parallelism.** A flaky Google CAPTCHA on worker 1
  doesn't poison worker 2.
- **No retries.** A failure usually means the site changed (rule needs
  updating); silent retries would hide that.
- **`SKIP_GOOGLE=1` / `SKIP_YOUTUBE=1` env vars.** When anti-bot is up,
  bypass those specific sites without skipping the whole run.
- **Traces + video on failure.** Open `playwright-report/` after a
  failed run to see exactly what Movar's content script did.

If a site's `initial: { bodyDetected }` set says `['ru', 'uk', 'unknown']`,
that's the fixture telling you "this site geolocates and sometimes
serves UA from a UA IP — accept either as a starting state". The
post-Movar assertion still demands `uk`, which is the property under
test.

## Picker-filter assertion tolerance

The picker-filter test (test 4) asserts on Movar's DOM signals:

- `data-movar-hidden` count ≥ `minHiddenLinks`.
- Each `hiddenSelectors` entry resolved to a node with `display:none` or
  `aria-hidden="true"`.
- Each `visibleSelectors` entry is **either** visible **or** its picker
  container has a Movar curtain (`data-movar-curtain` +
  `data-movar-kind="picker-container"`) immediately preceding an
  ancestor.

The two-mode tolerance is intentional: `filterPickers` collapses a
picker container into a chip overlay in strict mode (when no `blocked`
array is provided and only ≤1 language survives), but in production —
where `settings.blocked` is always populated — survives stay visible
with a tooltip. The fixture accepts both because the user-facing
property ("Movar reacted, the user still has access to the language they
want") is satisfied either way.

## What this suite is NOT

- It does not measure rule-bearing-site result quality (e.g. "are
  Google's results mostly UA after `lr=lang_uk`"). That's a hard
  signal-vs-noise problem; the rule's job is just to write the URL
  knob.
- It does not exercise the popup, options page, or background DNR.
  Vitest covers those in `apps/extension/src`.
- It does not run on Firefox. Manual Firefox verification lives at
  `pnpm --filter @movar/extension dev:firefox:installed`.
