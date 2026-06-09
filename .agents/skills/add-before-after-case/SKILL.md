---
name: add-before-after-case
description: |
  Wire a new before/after use case into BOTH the marketplace screenshot
  carousel and the marketing site diptych — they share backdrops and
  must stay in sync. Use when the user asks to add a new comparison /
  demo / before-after example to the extension screenshots, the
  marketing site's "See it in action" section, or both. Also use when
  the user mentions adding a new "use case", "scenario", "pair", or
  "diptych" to the screenshots pipeline. Do NOT use for: tweaking
  existing screenshots, generating per-locale variants of an existing
  scene, or marketing copy changes that don't touch the screenshots.
---

# Add a before/after use case (marketplace + marketing)

Both surfaces narrate the same "what Movar fixes" stories — they just
deliver them in different shapes:

- **Marketplace** ships one composed 1280×800 diptych PNG per scene
  (the diptych frame is in the PNG). One numbered file per locale lands
  in `apps/extension/store-assets/screenshots/{en,uk}/NN-<slug>.png`.
- **Marketing** ships two single-half PNGs per pair — each captured
  light **and** `-dark`, at natural content height — and the Astro
  layer at `apps/marketing/src/components/Examples.astro` composes them
  at runtime, full-width and stacked, swapping light↔dark with
  `<picture>` + `prefers-color-scheme`.

Both share backdrop components and the same Playwright capture script
at `apps/extension/scripts/capture-storybook-assets.mts`. Story title
prefix routes the output:

| Prefix                      | Output root                          | Story dir                |
| --------------------------- | ------------------------------------ | ------------------------ |
| `Marketplace/Screenshots/*` | `store-assets/screenshots/{en,uk}/`  | `storyboards/stories/`   |
| `Marketing/Screenshots/*`   | `apps/marketing/public/screenshots/` | `storyboards/marketing/` |

## Procedure

**Rule of thumb: every new use case ships in BOTH surfaces** unless the
demo's premise excludes one (e.g. scene #5 / Knowledge Panel is UK-only
because Google falls back to English without an `hl` hint — there's no
observable EN before/after). When you must skip a locale, document why
in the story file header.

### 1. Shared backdrops

Build the React backdrop(s) under
`apps/extension/store-assets/storyboards/backdrops/`. Make them accept
`hideChrome?: boolean` (default `false`) and forward it to the inner
frame component. The marketplace diptych supplies its own browser
chrome at the half level; the marketing single-half does not.

Existing backdrop frames to reuse / mirror:

- `before-after-frame.tsx` — diptych composition (`BeforeAfterFrameWithFrame`).
- `google-serp-frame.tsx` — Google SERP illustration (used by scene #3).
- `google-knowledge-frame.tsx` — Google entity Knowledge Panel (used by scene #5).
- `news-{en,uk}.tsx`, `site-{en,uk,ru}.tsx`, `voya-*.tsx` — fictitious-site backdrops.

If you build a new fictitious brand, follow §5 of
`apps/extension/store-assets/REQUIREMENTS.md`: invented name, `.example`
TLD, no real third-party logos, no real personal context.

### 2. Marketing single-half stories

Add two stories under
`apps/extension/store-assets/storyboards/marketing/`:

- `<name>-without.stories.tsx` — title
  `Marketing/Screenshots/<Name>Without`, output
  `<name>-without-movar.png`.
- `<name>-with.stories.tsx` — title
  `Marketing/Screenshots/<Name>With`, output
  `<name>-with-movar.png`.

Each story sets `parameters: { layout: 'fullscreen', viewport: { width: <content-width>, height: 800 }, captureOutput: { path: '<file>.png' }, naturalHeight: true, darkVariant: true }`
and renders the backdrop with its built-in chrome (no `hideChrome`). Set
`viewport.width` to the scene's **natural content width** (the width at
which the page content fills the frame edge-to-edge without being
stretched — e.g. a Google SERP's ~680px column + padding) so the
marketing layout can scale it to fit; `naturalHeight` then captures the
full height (not an 800px crop); `darkVariant` emits the `-dark` sibling
under `prefers-color-scheme: dark` (give the backdrop a dark `@media`
block over its scoped CSS vars).

### 3. Marketplace diptych story

Add one story under
`apps/extension/store-assets/storyboards/stories/<scene>.stories.tsx`
titled `Marketplace/Screenshots/<Scene>` with the next free
`screenshotIndex`. Compose the two backdrops inside
`BeforeAfterFrameWithFrame`, passing `hideChrome` on each. Export
`English` and `Ukrainian` story functions — or, if a locale is
intentionally skipped, document the reason in the file header and omit
that export (the capture script throws on stories named anything other
than `English` / `Ukrainian`, so omitting is cleaner than a renamed
export).

Caption bodies live inline in the story render functions (search-rewrite
is the canonical template) — keep them under three lines at the diptych's
caption width (~540px @ 18px body).

### 4. Marketing site integration

The marketing pairs render in
`apps/marketing/src/components/Examples.astro`, keyed by the index of
the matching entry in `strings.examples.entries` (`apps/marketing/src/i18n.ts`):

- Add (or confirm) the `examples.entries` entry for the scene in both
  `en` and `uk` — each has `site`, `scenario`, `without`, `withMovar`.
- Add an `imagePairs[<index>]` record in `Examples.astro` with the
  `without`/`with` light `src` + `alt`. The `-dark` siblings and the
  `existsSync` gate are handled automatically: a pair renders only when
  both light PNGs are on disk, and the dark `<picture>` source is added
  when the `-dark` PNG exists. Missing pairs degrade to text-only.

If `Examples.stories.tsx` mocks the section, keep its layout in step —
it renders the text-only fallback, since the Storybook canvas has no
built `public/` dir.

### 5. Docs

Update three docs in lockstep:

- `apps/extension/store-assets/README.md` — add a row to the
  "Required shots" table (file, locales, backdrop, layout).
- `apps/extension/store-assets/REQUIREMENTS.md` §5 — add a row to the
  screenshot-set table; mention any locale skips with the reason.
- `apps/extension/store-assets/REQUIREMENTS.md` §6 — add asset rows
  for each per-locale PNG ("Screenshot #N <slug> (UK)", etc.).
- `apps/marketing/public/screenshots/README.md` — add a row to the
  filename table.

### 6. Capture and commit

```
pnpm capture:storybook-assets
```

Or from a sub-package directory:

```
pnpm --filter @movar/extension capture:storybook-assets
```

Commit the resulting PNGs in the same change as the source so PR
review surfaces the visual diff.

## Concrete example

Scene #5 (Knowledge Panel) is the canonical example of this convention
applied:

- Backdrops: `apps/extension/store-assets/storyboards/backdrops/google-{god-of-war-with-movar,god-of-war-without-movar,knowledge-frame}.tsx`
- Marketing stories: `apps/extension/store-assets/storyboards/marketing/google-god-of-war-{with,without}.stories.tsx`
- Marketplace diptych story: `apps/extension/store-assets/storyboards/stories/knowledge-panel.stories.tsx` (UK-only — see header)
- Marketing PNGs: `apps/marketing/public/screenshots/google-god-of-war-{with,without}-movar.png`
- Marketplace PNG: `apps/extension/store-assets/screenshots/uk/05-knowledge-panel.png`

When in doubt, mirror the structure of scene #3 (search-rewrite —
fully bilingual) or scene #5 (knowledge-panel — UK-only with a
documented skip).
