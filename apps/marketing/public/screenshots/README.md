# Marketing screenshots

PNGs rendered from the extension's Storybook under the
`Marketing/Screenshots/*` title prefix. The marketing site references
them by exact filename.

| Filename                              | What it shows                                                                | Aspect  | Dimensions   |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------- | ------------ |
| `popup.png`                           | Extension popup over a neutral surface                                       | 4:3     | 480×360      |
| `options.png`                         | Extension options page with an edited priority list                          | 16:10   | 1280×800     |
| `google-without-movar.png`            | Synthesised google.com.ua SERP with Russian results dominating               | natural | content×auto |
| `google-with-movar.png`               | Same query with `&hl=uk&lr=lang_uk` appended, Ukrainian results top          | natural | content×auto |
| `google-god-of-war-without-movar.png` | Latin-script "God of War" query with the Knowledge Panel rendered in English | natural | content×auto |
| `google-god-of-war-with-movar.png`    | Same query with `&hl=uk&lr=lang_uk`, Knowledge Panel localised to Ukrainian  | natural | content×auto |
| `youtube-without-movar.png`           | YouTube search whose recommendations skew Russian (no language hint)         | natural | content×auto |
| `youtube-with-movar.png`              | Same search; Movar's language/region hints surface Ukrainian creators        | natural | content×auto |
| `shop-without-movar.png`              | Fictitious Ukrainian shop _Крамко_ defaulting to its Russian edition         | natural | content×auto |
| `shop-with-movar.png`                 | Same shop served in Ukrainian after Movar's Accept-Language hint             | natural | content×auto |

Each before/after website shot above also has a `-dark.png` sibling
(e.g. `google-without-movar-dark.png`), captured under
`prefers-color-scheme: dark`. The four `google-*` shots and the
`youtube-*` / `shop-*` shots are captured at each scene's **natural
content width** (so the page content fills the frame edge-to-edge
without being stretched) with **height following the rendered content**;
the marketing layout then scales each shot to fit its column. `popup.png`
and `options.png` keep their fixed framing.

[`Examples.astro`](../../src/components/Examples.astro) renders each
before/after pair full-width and stacked — a pair shows only when both
of its light PNGs exist on disk; the `-dark` sibling is optional and
swapped in via a `<picture>` element so the shots track the visitor's
theme. Entries whose PNGs are missing degrade to a text-only breakdown.

## Regenerating

Sources live in the extension's Storybook because they reuse the
production popup and options components plus the shared `withBrowserMock`
decorator. To regenerate every PNG that ships out of the extension's
Storybook — marketplace screenshots + Chrome promo tile + these
marketing screenshots — run from the repo root:

```bash
pnpm capture:storybook-assets
```

(or, equivalently, `pnpm --filter @movar/extension capture:storybook-assets`.)

The script routes outputs by story title prefix:

- `Marketplace/Screenshots/*` → `apps/extension/store-assets/screenshots/{en,uk}/`
- `Marketplace/Promo/*` → `apps/extension/store-assets/{chrome,...}/`
- `Marketing/Screenshots/*` → this directory

Add `--no-build` when iterating against an already-built Storybook bundle.

## Adding or editing a marketing screenshot

1. Edit the React component (e.g. backdrops under
   `apps/extension/store-assets/storyboards/backdrops/`, or compose
   the real popup/options entrypoint) and the matching story under
   `apps/extension/store-assets/storyboards/marketing/`.
2. Each marketing story declares its own viewport and output filename:

   ```tsx
   parameters: {
     viewport: { width: 1280, height: 800 },
     captureOutput: { path: 'options.png' },
   }
   ```

3. Run `pnpm --filter @movar/extension capture:storybook-assets` and
   commit the resulting PNG alongside the source change so PR review
   surfaces the visual diff.

**Before/after pairs ship to both surfaces.** When you add a new
before/after use case here, also wire it into the marketplace
carousel as a `Marketplace/Screenshots/*` scene — the marketing
diptych and the marketplace diptych narrate the same story. See
[`apps/extension/store-assets/README.md` → "Adding a new before/after
use case"](../../../extension/store-assets/README.md#adding-a-new-beforeafter-use-case)
for the full procedure.

## On the Google SERPs

All four `google-*.png` PNGs are **synthesised** illustrations rendered
by React backdrops under
`apps/extension/store-assets/storyboards/backdrops/google-*.tsx`, not
real Google captures. The components reproduce Google's general visual
language editorially; they don't copy the trademarked logo verbatim
and use fictitious `.example`/`.example.org` domains so the diptychs
stay stable across Google's own layout drift.

Each `with` half highlights the `hl=uk` and `lr=lang_uk` query params
in the URL bar — the only user-visible Google behaviour Movar
introduces — so each comparison reads as one change, not a styling
divergence.

The "God of War" diptych focuses on the **Knowledge Panel** (the
summary card on the right of the SERP for entity queries) rather than
the result list, because Latin-script queries don't shift the result
ordering as dramatically — but the panel localises wholesale to
Ukrainian once `hl=uk` is in flight.
