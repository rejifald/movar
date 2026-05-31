# Marketing screenshots

PNGs rendered from the extension's Storybook under the
`Marketing/Screenshots/*` title prefix. The marketing site references
them by exact filename.

| Filename                   | What it shows                                                       | Aspect | Dimensions |
| -------------------------- | ------------------------------------------------------------------- | ------ | ---------- |
| `popup.png`                | Extension popup over a neutral surface                              | 4:3    | 480×360    |
| `options.png`              | Extension options page with an edited priority list                 | 16:10  | 1280×800   |
| `google-without-movar.png` | Synthesised google.com.ua SERP with Russian results dominating      | 16:10  | 1280×800   |
| `google-with-movar.png`    | Same query with `&hl=uk&lr=lang_uk` appended, Ukrainian results top | 16:10  | 1280×800   |

The `BeforeAfter.astro` component renders placeholder cards until
`google-without-movar.png` and `google-with-movar.png` exist at this
path.

## Regenerating

Sources live in the extension's Storybook because they reuse the
production popup and options components plus the shared `withBrowserMock`
decorator. To regenerate every PNG that ships out of the extension's
Storybook — marketplace screenshots + Chrome promo tile + these
marketing screenshots — run:

```bash
pnpm --filter @movar/extension capture:storybook-assets
```

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

## On the Google SERPs

The two `google-{without,with}-movar.png` PNGs are **synthesised**
illustrations rendered by
`apps/extension/store-assets/storyboards/backdrops/google-{without,with}-movar.tsx`,
not real Google captures. The components reproduce Google's general
visual language editorially; they don't copy the trademarked logo
verbatim and use fictitious `.example`/`.example.org` domains so the
diptych stays stable across Google's own layout drift.

The `with` half highlights the `hl=uk` and `lr=lang_uk` query params
in the URL bar — the only user-visible Google behaviour Movar
introduces — so the comparison reads as one change, not a styling
divergence.
