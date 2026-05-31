# Open Graph share cards

Per-locale 1200×630 PNGs referenced by `BaseLayout.astro`'s
`<meta property="og:image">`. Each subfolder mirrors a marketing-site
locale.

```
public/og/
  en/
    01-default.png   # Marketing/OG/Default story, English
  uk/
    01-default.png   # Marketing/OG/Default story, Ukrainian
```

The numeric prefix matches the source story's `parameters.screenshotIndex`
on `meta`, and the slug is the kebab-cased scene title beneath
`Marketing/OG/`. Pattern mirrors the extension's
`store-assets/screenshots/` layout so the two pipelines feel familiar.

## Regenerating

Stories live at `apps/marketing/src/og/*.stories.tsx`. Edit the
`OgCard.tsx` component or the `og.*` strings in `src/i18n.ts`, then:

```bash
pnpm --filter @movar/marketing capture:og
```

The script builds Storybook, drives Playwright Chromium at the canonical
1200×630 viewport, and writes each `Marketing/OG/*` story's PNG into the
locale folder. Add `--no-build` to skip the Storybook build when iterating
locally against an already-built bundle.

After regenerating, commit the resulting PNGs alongside the source change
so PR review surfaces the visual diff.

## Adding a new scene

1. Add a new `.stories.tsx` next to `OgCard.stories.tsx` with
   `title: 'Marketing/OG/<SceneName>'`, `parameters.screenshotIndex` set
   to the next free integer, and `English` + `Ukrainian` story exports.
2. Wire `BaseLayout.astro` (or whichever page needs it) to point at
   `/og/<lang>/<NN>-<scene-name>.png`.
3. Run `pnpm --filter @movar/marketing capture:og` and commit the new
   PNGs.
